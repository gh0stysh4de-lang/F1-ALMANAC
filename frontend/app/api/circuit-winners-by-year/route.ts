import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Podium (P1/P2/P3) for every year this circuit held a race. Powers the
// winners-by-year bar timeline: one bar per year (colored by the winner's
// team, labelled with the winner's surname), hover reveals the full podium.
//
// Flat SQL, grouped into { year, raceName, podium: [...] } in JS \u2014 same
// shape-in-JS-not-SQL pattern already used for the top-5 team breakdown, for
// the same reason: BigQuery's ARRAY_AGG(STRUCT(...)) output shape through the
// Node client isn't something this project has independently verified, and a
// flat SELECT ordered by year+position is trivial to group correctly here.
//
// Years the circuit didn't host a race (Spa skipped 2003 and 2006) simply
// have no rows \u2014 not a gap to fill, just an absent year, exactly like
// every other "COUNT what exists" query in this project.

const WINNERS_SQL = `
SELECT
  r.year        AS year,
  r.name        AS raceName,
  res.position  AS position,
  d.driverId    AS driverId,
  CONCAT(d.forename, ' ', d.surname) AS name,
  con.constructorRef AS constructorRef,
  con.name      AS team
FROM ${fq("results")} res
JOIN ${fq("races")} r ON r.raceId = res.raceId
JOIN ${fq("drivers")} d ON d.driverId = res.driverId
JOIN ${fq("constructors")} con ON con.constructorId = res.constructorId
WHERE r.circuitId = @id AND res.position IN (1, 2, 3)
ORDER BY r.year ASC, res.position ASC
`;

type Row = {
  year: number;
  raceName: string;
  position: number;
  driverId: number;
  name: string;
  constructorRef: string;
  team: string;
};

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
    const rows = await query<Row>(WINNERS_SQL, { id });

    const byYear = new Map<
      number,
      { year: number; raceName: string; podium: Omit<Row, "year" | "raceName">[] }
    >();

    for (const r of rows) {
      if (!byYear.has(r.year)) {
        byYear.set(r.year, { year: r.year, raceName: r.raceName, podium: [] });
      }
      byYear.get(r.year)!.podium.push({
        position: r.position,
        driverId: r.driverId,
        name: r.name,
        constructorRef: r.constructorRef,
        team: r.team,
      });
    }

    const years = Array.from(byYear.values()).sort((a, b) => a.year - b.year);

    return NextResponse.json(
      { years },
      {
        headers: {
          "Cache-Control":
            process.env.NODE_ENV === "production"
              ? "public, max-age=3600"
              : "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/circuit-winners-by-year]", err);
    return NextResponse.json(
      { error: "Failed to load winners by year" },
      { status: 500 }
    );
  }
}
