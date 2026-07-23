import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Turn names for a circuit. Feeds the hover labels on the track outline.
//
// The shape here is deliberately not "turn number -> name". Names cover
// RANGES: F1.com groups Spa's turns 2, 3 and 4 under one name
// ("Le Raidillon de l'Eau Rouge"), and roughly a third of the turns on a
// documented circuit have no name at all. A flat map would have to invent
// names for the gaps or split shared ones — both wrong.
//
// So this returns the ranges as collected, and the client resolves a turn
// number to whichever range contains it, falling back to "Turn N".
//
// Coverage is thin on purpose: 12 circuits, and even those are uneven
// (Spa and Monaco are near-complete, Catalunya has 6 names for 14 turns).
// A circuit with no rows is the normal case, not an error.

const TURNS_SQL = `
SELECT
  turn_from  AS turnFrom,
  turn_to    AS turnTo,
  name       AS name,
  name_alt   AS nameAlt,
  kind       AS kind,
  confidence AS confidence,
  note       AS note,
  source_url AS sourceUrl
FROM ${fq("circuit_turns")}
WHERE circuitRef = @ref
ORDER BY turn_from, turn_to
`;

type Row = {
  turnFrom: number;
  turnTo: number;
  name: string;
  nameAlt: string | null;
  kind: string;
  confidence: string;
  note: string | null;
  sourceUrl: string;
};

// Same guard as /api/circuit-map: circuitRef shape only.
const SAFE_REF = /^[a-z0-9_-]+$/i;

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");

  if (!ref || !SAFE_REF.test(ref)) {
    return NextResponse.json(
      { error: "Query param `ref` must be a circuitRef" },
      { status: 400 }
    );
  }

  try {
    const rows = await query<Row>(TURNS_SQL, { ref });

    return NextResponse.json(
      { turns: rows },
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
    // A missing circuit_turns table shouldn't take the page down — the map
    // works fine with numeric labels only.
    console.error("[/api/circuit-turns]", err);
    return NextResponse.json({ turns: [] });
  }
}
