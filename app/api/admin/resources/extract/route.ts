import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { getSkillGraph } from "@/lib/graph/queries";
import { findResourceByUrl } from "@/lib/db/resources";
import { fetchPageText } from "@/lib/services/page-text";
import { extractResourceFields } from "@/lib/llm/resource-extraction";
import { isAllowedHost, normalizeHost } from "@/lib/services/catalog-validation";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ url: z.string().url().max(2000) });

/**
 * Autofill for the catalog form: fetch the page the admin pasted, then read the
 * record off that page.
 *
 * Admin-only, same as the rest of this surface — it makes an outbound fetch and
 * a model call on demand, which is not something an anonymous caller should be
 * able to aim anywhere. `fetchPageText` refuses private hosts (SSRF), and the
 * model only ever sees text that came back from the fetch.
 *
 * Nothing is saved here. The response fills a form the admin reviews, and every
 * validation rule still runs on save.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Paste a full URL, including https://." }, { status: 400 });
  }

  const { url } = parsed.data;
  const page = await fetchPageText(url);

  if (!page.ok) {
    // The same failure the save path would report, surfaced before the admin
    // fills in a form for a page that cannot be reached.
    return NextResponse.json({ error: `Could not read that page — ${page.detail}` }, { status: 422 });
  }

  const [graph, duplicate] = await Promise.all([getSkillGraph(), findResourceByUrl(url)]);
  const fields = await extractResourceFields({ page, skills: graph.skills, url });

  if (!fields) {
    return NextResponse.json(
      { error: "The page was read, but the assistant could not fill the form. Fill it in manually." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    fields,
    // Facts the server knows and the model is not asked about, so they cannot
    // be guessed: whether this URL is already in the catalog, and whether the
    // host needs the off-allowlist confirmation the save path asks for.
    duplicateOf: duplicate?.id ?? null,
    hostAllowed: isAllowedHost(url),
    host: normalizeHost(url),
    pageTitle: page.title,
    checkedAt: new Date().toISOString().slice(0, 10)
  });
}
