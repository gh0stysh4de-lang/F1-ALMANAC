import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Circuit description endpoint. Resolves the track's Wikipedia page (from
// circuits.url) and asks the Wikipedia extracts API for the article intro.
// Returns { description: string | null } — the client falls back to a factual
// subtitle when null.
//
// Same pattern as /api/constructor-description. Two deliberate differences:
//
//  1. MAX_CHARS is larger (700 vs 360). The circuit panel is wider than the
//     constructor badge row and the brief asks for a fuller description; track
//     intros also carry more useful detail (layout history, elevation, why the
//     place matters) than team intros, which front-load corporate structure.
//
//  2. The disambiguation filter matters more here. Several circuits share a
//     name with the town they sit in ("Imola", "Zandvoort", "Interlagos"), so
//     the URL can land on a settlement article or a "may refer to" page.

const URL_SQL = `
SELECT url
FROM ${fq("circuits")}
WHERE circuitId = @id
LIMIT 1
`;

const WIKI_UA = "F1Almanac/1.0 (portfolio project; contact via GitHub)";

// Request generously, then trim by length: intro sentences vary wildly.
const SENTENCES = "6";

// Roughly what fits in the identity panel at the current type size.
const MAX_CHARS = 700;

function pageTitleFromUrl(rawUrl: string): string | null {
  const marker = "/wiki/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) return null;
  const encoded = rawUrl.slice(idx + marker.length).trim();
  if (encoded === "") return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

// Wikipedia intros open with pronunciation guides and parenthetical asides
// that read badly in a compact panel:
//   "Circuit de Spa-Francorchamps (French pronunciation: ...) is a ..."
//   "Suzuka International Racing Course (鈴鹿サーキット) is a ..."
// Strip those, then clean up what the removal leaves behind.
function tidy(extract: string): string {
  return (
    extract
      .replace(
        /\s*\((?=[^)]*(?:pronounced|pronunciation|IPA|listen|\/[^/)]+\/|[A-Z]{2,}-))[^)]*\)/gi,
        ""
      )
      // Native-name and romanisation asides:
      //   "(Japanese: 鈴鹿国際レーシングコース, Hepburn: Suzuka Kokusai Rēsingu Kōsu)"
      //   "(Chinese: 上海国际赛车场; pinyin: Shànghǎi Guójì Sàichēchǎng)"
      // These eat ~90 chars of a 700-char budget — a sentence of real content
      // traded for a transliteration nobody reads.
      //
      // Any parenthetical containing a character outside Latin+Latin-1
      // Supplement+Latin Extended-A goes. The guard keeps accented Latin, so
      // "(Autódromo José Carlos Pace)" survives while CJK, Cyrillic, Arabic,
      // and IPA brackets do not.
      .replace(/\s*\([^)]*[^\x00-\x7F][^)]*\)/g, (m) =>
        /[\u00C0-\u024F]/.test(m) && !/[^\u0000-\u024F]/.test(m) ? m : ""
      )
      .replace(/\(\s*\)/g, "")
      .replace(/\s+,/g, ",")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

// Cut to a character budget on a sentence boundary, never mid-word.
function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;

  const slice = text.slice(0, budget);
  // Find the last sentence end inside the budget.
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? ")
  );

  if (lastStop > budget * 0.4) return slice.slice(0, lastStop + 1).trim();

  // No sentence break early enough — fall back to a word boundary.
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim() + "\u2026";
}

function isDisambiguation(page: {
  pageprops?: Record<string, unknown>;
  extract?: string;
}): boolean {
  if (page.pageprops && "disambiguation" in page.pageprops) return true;
  const e = (page.extract ?? "").slice(0, 160).toLowerCase();
  return e.includes("may refer to") || e.includes("may also refer to");
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("id");
  const id = Number(raw);

  if (!raw || !Number.isInteger(id)) {
    return NextResponse.json(
      { error: "Query param `id` must be an integer circuitId" },
      { status: 400 }
    );
  }

  try {
    const rows = await query<{ url: string | null }>(URL_SQL, { id });
    const url = rows[0]?.url;
    if (!url) return NextResponse.json({ description: null });

    const title = pageTitleFromUrl(url);
    if (!title) return NextResponse.json({ description: null });

    const api = new URL("https://en.wikipedia.org/w/api.php");
    api.searchParams.set("action", "query");
    api.searchParams.set("format", "json");
    api.searchParams.set("prop", "extracts|pageprops");
    api.searchParams.set("exintro", "1");
    api.searchParams.set("explaintext", "1");
    api.searchParams.set("exsentences", SENTENCES);
    api.searchParams.set("redirects", "1");
    api.searchParams.set("titles", title);

    const res = await fetch(api.toString(), {
      headers: { "User-Agent": WIKI_UA },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return NextResponse.json({ description: null });

    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as
      | { extract?: string; pageprops?: Record<string, unknown> }
      | undefined;

    if (!page?.extract || isDisambiguation(page)) {
      return NextResponse.json({ description: null });
    }

    const cleaned = trimToBudget(tidy(page.extract), MAX_CHARS);

    return NextResponse.json(
      { description: cleaned.length > 0 ? cleaned : null },
      {
        headers: {
          "Cache-Control":
            process.env.NODE_ENV === "production"
              ? "public, max-age=86400"
              : "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/circuit-description]", err);
    return NextResponse.json({ description: null });
  }
}
