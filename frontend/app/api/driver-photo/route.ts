import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Driver photo endpoint. Resolves the driver's Wikipedia page (from
// drivers.url) and asks the Wikipedia pageimages API for a thumbnail.
// Returns { photoUrl: string | null } — the client falls back to an icon
// when null.

const URL_SQL = `
SELECT url
FROM ${fq("drivers")}
WHERE driverId = @id
LIMIT 1
`;

// Wikipedia asks API clients to send a descriptive User-Agent.
const WIKI_UA = "F1Almanac/1.0 (portfolio project; contact via GitHub)";

// Extract the page title from a Wikipedia URL.
//   http://en.wikipedia.org/wiki/Lewis_Hamilton            -> Lewis_Hamilton
//   https://en.wikipedia.org/wiki/Kimi_R%C3%A4ikk%C3%B6nen -> Kimi_Räikkönen
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
      // No usable Wikipedia URL on this driver record at all — that's a
      // stable fact (it won't start existing on the next request), safe to
      // cache like a real result rather than retried every time.
      return NextResponse.json(
        { photoUrl: null },
        { headers: { "Cache-Control": "public, max-age=86400" } }
      );
    }

    // Wikipedia pageimages API. redirects=1 follows page redirects to the
    // canonical article so we still find the image.
    const api =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        format: "json",
        prop: "pageimages",
        piprop: "thumbnail",
        pithumbsize: "256",
        redirects: "1",
        titles: title,
      }).toString();

    const wiki = await fetch(api, {
      headers: { "User-Agent": WIKI_UA },
    });

    if (!wiki.ok) {
      // Wikipedia itself returned an error — plausibly transient (rate
      // limiting is exactly what motivated this change: a picker firing ten
      // parallel requests per page load, with no caching, is precisely the
      // pattern that trips a public API's abuse throttling). A short cache
      // lets this recover on its own within a minute instead of retrying on
      // every single request while Wikipedia is actively throttling us, or
      // getting stuck on "no photo" for a full day if cached long.
      return NextResponse.json(
        { photoUrl: null },
        { headers: { "Cache-Control": "public, max-age=60" } }
      );
    }

    const data = (await wiki.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };

    const pages = data.query?.pages ?? {};
    const first = Object.values(pages)[0];
    const photoUrl = first?.thumbnail?.source ?? null;

    return NextResponse.json(
      { photoUrl },
      {
        headers: {
          // A driver's Wikipedia thumbnail — or the fact that the article has
          // none — doesn't change day to day, so this is safe to cache hard.
          // The previous no-store here was fine when this route was only
          // ever called one driver at a time (opening a single profile), but
          // the driver picker now fires all ten of its curated drivers in
          // parallel on every page load with no caching in between —
          // exactly the pattern that gets an anonymous client rate-limited
          // by a public API. Long caching is what makes repeat loads (and
          // repeat refreshes) NOT re-hit Wikipedia at all for drivers already
          // resolved once.
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (err) {
    console.error("[/api/driver-photo] failed:", err);
    // Soft-fail: the UI just shows the placeholder icon.
    return NextResponse.json({ photoUrl: null }, { status: 200 });
  }
}
