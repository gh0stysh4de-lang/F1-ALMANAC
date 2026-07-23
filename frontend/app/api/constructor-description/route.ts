import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Constructor description endpoint. Resolves the team's Wikipedia page (from
// constructors.url) and asks the Wikipedia extracts API for the article intro.
// Returns { description: string | null } — the client falls back to the
// factual subtitle when null.
//
// Why Wikipedia rather than a generated constructor_descriptions table: the
// URL is already in the dataset for all 214 teams, and a sourced summary beats
// text invented from model memory. Same approach as /api/driver-photo.

const URL_SQL = `
SELECT url
FROM ${fq("constructors")}
WHERE constructorId = @id
LIMIT 1
`;

// Wikipedia asks API clients to send a descriptive User-Agent.
const WIKI_UA = "F1Almanac/1.0 (portfolio project; contact via GitHub)";

// How many sentences to ask Wikipedia for. We request generously and then
// trim by length below: intro sentences vary wildly (McLaren's first sentence
// alone fills the panel, Jordan's is a single short line), so a fixed sentence
// count either starves the short ones or overflows the long ones.
const SENTENCES = "4";

// Roughly what fits in the panel's four lines at the current type size.
const MAX_CHARS = 360;

// Extract the page title from a Wikipedia URL.
//   http://en.wikipedia.org/wiki/Scuderia_Ferrari -> Scuderia_Ferrari
function pageTitleFromUrl(rawUrl: string): string | null {
  const marker = "/wiki/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) return null;
  const encoded = rawUrl.slice(idx + marker.length).trim();
  if (encoded === "") return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded; // already decoded or malformed escape; use as-is
  }
}

// Wikipedia intros open with pronunciation guides and parenthetical asides
// that read badly in a compact panel:
//   "McLaren Racing Limited ( ma-KLARR-ən), currently..."
//   "Alpine Racing Limited (French pronunciation: ...), currently..."
// Strip those, then clean up anything the removal left behind (empty parens,
// doubled spaces, a space before a comma).
function tidy(extract: string): string {
  return (
    extract
      // Parenthetical containing a pronunciation respelling: hyphenated
      // ALL-CAPS chunks (ma-KLARR-ən), IPA slashes, or explicit markers.
      .replace(
        /\s*\((?=[^)]*(?:pronounced|pronunciation|IPA|listen|\/[^/)]+\/|[A-Z]{2,}-))[^)]*\)/gi,
        ""
      )
      // Any parens left empty or whitespace-only by the above.
      .replace(/\s*\(\s*\)/g, "")
      // Tidy the seams.
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

// Trim to a character budget, cutting at a sentence boundary rather than
// mid-word. Always keeps at least the first sentence, even if that sentence
// alone exceeds the budget (the UI's line-clamp catches that rare case).
function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;

  // Sentence ends: a period/question/exclamation followed by a space+capital,
  // or end of string. Avoids splitting on "No. 1" or "St. Louis".
  const enders: number[] = [];
  const re = /[.!?](?=\s+[A-Z"'(]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) enders.push(m.index + 1);

  if (enders.length === 0) return text;

  // Last sentence end that fits the budget.
  const fits = enders.filter((i) => i <= budget);
  if (fits.length > 0) return text.slice(0, fits[fits.length - 1]).trim();

  // Even the first sentence is over budget — keep it whole.
  return text.slice(0, enders[0]).trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid or missing 'id' query param." },
      { status: 400 }
    );
  }

  try {
    const rows = await query<{ url: string | null }>(URL_SQL, { id });
    const rawUrl = rows[0]?.url ?? null;
    const title = rawUrl ? pageTitleFromUrl(rawUrl) : null;

    if (!title) {
      return NextResponse.json(
        { description: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Wikipedia extracts API: plain-text intro, capped at a few sentences.
    // redirects=1 follows page redirects to the canonical article.
    // pageprops lets us detect disambiguation pages ("Lotus Racing may refer
    // to: ..."), which are not descriptions and must not be shown.
    const api =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        format: "json",
        prop: "extracts|pageprops",
        exintro: "1",
        explaintext: "1",
        exsentences: SENTENCES,
        redirects: "1",
        titles: title,
      }).toString();

    const wiki = await fetch(api, {
      headers: { "User-Agent": WIKI_UA },
    });

    if (!wiki.ok) {
      return NextResponse.json(
        { description: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = (await wiki.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            extract?: string;
            pageprops?: { disambiguation?: string };
          }
        >;
      };
    };

    const pages = data.query?.pages ?? {};
    const first = Object.values(pages)[0];

    // Disambiguation pages ("Lotus Racing may refer to: ...") are not
    // descriptions. Several F1 names are ambiguous (Lotus, Lola, March), so
    // detect them two ways: the explicit pageprops flag, and the stock
    // phrasing as a backstop for pages missing the flag. The phrase check is
    // anchored to the opening clause so a real article that happens to say
    // "may refer to" mid-sentence isn't discarded.
    const extract = first?.extract ?? "";
    const isDisambiguation =
      first?.pageprops?.disambiguation !== undefined ||
      /^[^.]{0,80}\bmay (?:refer|stand for)\b/i.test(extract.trim());

    const raw = isDisambiguation ? "" : extract;
    const cleaned = raw.trim() === "" ? null : tidy(raw);
    const description =
      cleaned === null ? null : trimToBudget(cleaned, MAX_CHARS);

    return NextResponse.json(
      { description, source: rawUrl },
      {
        headers: {
          // TEMP: no-store during active development, matching driver-photo.
          // Wikipedia intros rarely change; cache once the page is stable.
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/constructor-description] failed:", err);
    // Soft-fail: the UI falls back to the factual subtitle.
    return NextResponse.json({ description: null }, { status: 200 });
  }
}
