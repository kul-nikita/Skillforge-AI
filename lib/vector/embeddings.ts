import { LlmError, postJsonWithRetry } from "@/lib/llm/client";

const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

export async function embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LlmError("GEMINI_API_KEY is required for embeddings.", null, false);
  }

  // Shares the retry policy with the generate calls: the free tier rate-limits
  // batches of embeddings, and a 429 is a wait rather than a failure.
  const response = await postJsonWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS
    }
  );

  const payload = await response.json().catch(() => null);
  const values = payload?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new LlmError("Gemini embedding response missing values.", null, true);
  }

  return values as number[];
}
