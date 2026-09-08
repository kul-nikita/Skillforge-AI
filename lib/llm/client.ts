import type { ZodType, ZodTypeDef } from "zod";

/**
 * One place where a chat-model call is made.
 *
 * There used to be four hand-rolled `fetch` call sites with no timeout and no
 * retry, so a transient 503 from the model surfaced as a 500 from our own API.
 * A model call is a network call to someone else's overloaded service: retrying
 * a 429/5xx is the difference between "the AI mentor is broken" and "it took
 * two seconds".
 *
 * The provider is Cerebras (OpenAI-compatible `/chat/completions`). Embeddings
 * are NOT here — Cerebras serves no embedding model, so `lib/vector/embeddings`
 * still calls Gemini and only borrows `postJsonWithRetry` from this file.
 */

const CHAT_URL = "https://api.cerebras.ai/v1/chat/completions";
export const CHAT_MODEL = "gemma-4-31b";

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** True when the caller could reasonably try again later. */
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export function llmApiKey(): string | undefined {
  return process.env.CEREBRAS_API_KEY || undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST with a timeout, retrying transient failures with exponential backoff.
 * Exported because embeddings hit a different provider but need the same
 * resilience.
 */
export async function postJsonWithRetry(
  url: string,
  body: unknown,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers = {}
  }: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  let lastError: LlmError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(500 * 2 ** (attempt - 1));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      // Network error or timeout — always worth one more try.
      lastError = new LlmError(error instanceof Error ? error.message : String(error), null, true);
      continue;
    }

    if (response.ok) {
      return response;
    }

    const detail = await response.text().catch(() => "");
    lastError = new LlmError(
      `Model request failed: ${response.status} ${detail.slice(0, 300)}`,
      response.status,
      RETRY_STATUSES.has(response.status)
    );

    if (!lastError.retryable) {
      throw lastError;
    }
  }

  throw lastError ?? new LlmError("Model request failed.", null, true);
}

/**
 * Translate a Gemini-style response schema into the JSON Schema that
 * OpenAI-compatible `strict` structured output expects.
 *
 * The call sites were written against Gemini and describe their shapes in its
 * dialect (`type: "OBJECT"`, `nullable: true`). Converting here keeps that one
 * difference in one function instead of rewriting nine schema literals — and
 * `strict` mode is why this has to be exact: it requires every property listed
 * in `required` and `additionalProperties: false`, or the API rejects the call.
 */
export function toStrictJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toStrictJsonSchema);
  }
  if (schema === null || typeof schema !== "object") {
    return schema;
  }

  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    // `nullable` is Gemini's spelling; JSON Schema says so in the type itself.
    if (key === "nullable") continue;
    if (key === "type" && typeof value === "string") {
      const type = value.toLowerCase();
      out.type = source.nullable === true ? [type, "null"] : type;
      continue;
    }
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [
          name,
          toStrictJsonSchema(sub)
        ])
      );
      continue;
    }
    out[key] = toStrictJsonSchema(value);
  }

  if (out.type === "object" || (Array.isArray(out.type) && out.type.includes("object"))) {
    // strict mode: every declared property must be required, and nothing else
    // may appear. Optionality is expressed as a nullable type instead.
    out.required = Object.keys((out.properties as Record<string, unknown>) ?? {});
    out.additionalProperties = false;
  }

  return out;
}

export type LlmCall = {
  system: string;
  user: string;
  /** A Gemini-style response schema — set it and the reply is guaranteed JSON. */
  responseSchema?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
};

/** Raw text from the model. Throws LlmError; never returns an empty string. */
export async function llmText(call: LlmCall): Promise<string> {
  const apiKey = llmApiKey();
  if (!apiKey) {
    throw new LlmError("CEREBRAS_API_KEY is not set.", null, false);
  }

  const response = await postJsonWithRetry(
    CHAT_URL,
    {
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user }
      ],
      ...(call.responseSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "response",
                strict: true,
                schema: toStrictJsonSchema(call.responseSchema)
              }
            }
          }
        : {}),
      ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
      ...(call.maxOutputTokens !== undefined ? { max_tokens: call.maxOutputTokens } : {})
    },
    {
      timeoutMs: call.timeoutMs,
      retries: call.retries,
      headers: { Authorization: `Bearer ${apiKey}` }
    }
  );

  const payload = await response.json().catch(() => null);
  const text: unknown = payload?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new LlmError("Model returned no text.", null, true);
  }

  return text;
}

/** Structured output, validated against a zod schema before it can be used. */
// The input type is left open: a schema using .default() has optional inputs
// and a required output, and callers care about the output.
export async function llmJson<T>(
  call: LlmCall,
  schema: ZodType<T, ZodTypeDef, unknown>
): Promise<T> {
  const text = await llmText(call);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LlmError("Model returned invalid JSON.", null, true);
  }

  return schema.parse(parsed);
}
