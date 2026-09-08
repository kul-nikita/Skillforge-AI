import type { ZodType } from "zod";

/**
 * One place where a Gemini call is made.
 *
 * There used to be four hand-rolled `fetch` call sites with no timeout and no
 * retry, so a transient 503 from the model surfaced as a 500 from our own API.
 * A model call is a network call to someone else's overloaded service: retrying
 * a 429/5xx is the difference between "the AI mentor is broken" and "it took
 * two seconds".
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_MODEL = "gemini-2.5-flash";

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** True when the caller could reasonably try again later. */
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST with a timeout, retrying transient failures with exponential backoff.
 * Exported because embeddings hit a different endpoint but need the same
 * resilience.
 */
export async function postJsonWithRetry(
  url: string,
  body: unknown,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES }: { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(500 * 2 ** (attempt - 1));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      // Network error or timeout — always worth one more try.
      lastError = new GeminiError(
        error instanceof Error ? error.message : String(error),
        null,
        true
      );
      continue;
    }

    if (response.ok) {
      return response;
    }

    const detail = await response.text().catch(() => "");
    lastError = new GeminiError(
      `Gemini request failed: ${response.status} ${detail.slice(0, 300)}`,
      response.status,
      RETRY_STATUSES.has(response.status)
    );

    if (!lastError.retryable) {
      throw lastError;
    }
  }

  throw lastError ?? new GeminiError("Gemini request failed.", null, true);
}

export type GeminiCall = {
  system: string;
  user: string;
  /** Gemini's own responseSchema — set it and the reply is guaranteed JSON. */
  responseSchema?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
};

/** Raw text from the model. Throws GeminiError; never returns an empty string. */
export async function geminiText(call: GeminiCall): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new GeminiError("GEMINI_API_KEY is not set.", null, false);
  }

  const generationConfig: Record<string, unknown> = {};
  if (call.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = call.responseSchema;
  }
  if (call.temperature !== undefined) {
    generationConfig.temperature = call.temperature;
  }
  if (call.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = call.maxOutputTokens;
  }

  const response = await postJsonWithRetry(
    `${BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      systemInstruction: { parts: [{ text: call.system }] },
      contents: [{ role: "user", parts: [{ text: call.user }] }],
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    },
    { timeoutMs: call.timeoutMs, retries: call.retries }
  );

  const payload = await response.json().catch(() => null);
  const text: unknown = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new GeminiError("Model returned no text.", null, true);
  }

  return text;
}

/** Structured output, validated against a zod schema before it can be used. */
export async function geminiJson<T>(call: GeminiCall, schema: ZodType<T>): Promise<T> {
  const text = await geminiText(call);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned invalid JSON.", null, true);
  }

  return schema.parse(parsed);
}
