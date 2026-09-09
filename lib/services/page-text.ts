import { isSafeFetchTarget } from "@/lib/services/catalog-validation";

/**
 * Fetches a page and reduces it to readable text.
 *
 * This exists so catalog metadata can be *extracted from the page itself*
 * rather than recalled by a model. Product rule 1 says the LLM never originates
 * a URL, price, duration or provider — reading them off the real page is not
 * originating them, but only if the text genuinely comes from the page, which
 * is why this is a plain fetch with no model anywhere near it.
 */

export type PageText = {
  ok: boolean;
  status: number | null;
  /** Title tag and meta description, pulled out because they are the highest-signal bits. */
  title: string | null;
  metaDescription: string | null;
  /** Visible-ish body text, capped. */
  text: string;
  detail: string;
};

/** Enough to characterise a page; more just costs tokens and adds boilerplate. */
const MAX_TEXT_CHARS = 6000;

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? decode(match[1]).trim() || null : null;
}

export function extractReadableText(html: string): Omit<PageText, "ok" | "status" | "detail"> {
  const title =
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

  const metaDescription =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  const text = decode(
    html
      // Script and style content is not page text, and it is most of the bytes.
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { title, metaDescription, text };
}

export async function fetchPageText(url: string, timeoutMs = 12_000): Promise<PageText> {
  const empty = { title: null, metaDescription: null, text: "" };

  if (!isSafeFetchTarget(url)) {
    return {
      ...empty,
      ok: false,
      status: null,
      detail: "Only public http(s) URLs can be read — that host is local or private."
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SkillForgeCatalogBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
        // Without this, geo-aware sites serve their local language and the
        // extracted title and description land in the catalog in German or
        // Japanese. Observed on cloud.google.com and microsoft.com.
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      return { ...empty, ok: false, status: response.status, detail: `Returned HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("html") && !contentType.includes("text/plain")) {
      return {
        ...empty,
        ok: false,
        status: response.status,
        detail: `Not a readable page (${contentType || "unknown content type"})`
      };
    }

    return {
      ...extractReadableText(await response.text()),
      ok: true,
      status: response.status,
      detail: `Read (HTTP ${response.status})`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...empty,
      ok: false,
      status: null,
      detail: message.includes("abort") ? `No response within ${timeoutMs / 1000}s` : message
    };
  } finally {
    clearTimeout(timer);
  }
}
