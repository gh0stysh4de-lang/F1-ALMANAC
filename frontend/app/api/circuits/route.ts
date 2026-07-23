import { NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Circuit list for the header search box. Mirrors /api/constructors: one cheap
// query, cached for an hour, sorted so the tracks people actually look for
// (recent, frequently used) come first.
//
// Only circuits that have actually hosted a championship race are returned —
// the circuits table has a few entries with no races attached, and offering
// them in search leads to an empty profile.

const LIST_SQL = `
WITH completed_races AS (
  SELECT
    r.raceId,
    r.circuitId,
    r.year
  FROM ${fq("races")} r
  JOIN (
    SELECT DISTINCT raceId
    FROM ${fq("results")}
  ) completed ON completed.raceId = r.raceId
)
SELECT
  c.circuitId               AS id,
  c.circuitRef              AS ref,
  c.name                    AS name,
  c.location                AS location,
  c.country                 AS country,
  MIN(r.year)               AS firstYear,
  MAX(r.year)               AS lastYear,
  COUNT(DISTINCT r.raceId)  AS races
FROM ${fq("circuits")} c
JOIN completed_races r ON r.circuitId = c.circuitId
GROUP BY c.circuitId, c.circuitRef, c.name, c.location, c.country
ORDER BY lastYear DESC, races DESC
`;

type Row = {
  id: number;
  ref: string;
  name: string;
  location: string | null;
  country: string | null;
  firstYear: number;
  lastYear: number;
  races: number;
};

export async function GET() {
  try {
    const rows = await query<Row>(LIST_SQL);

    const items = rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      name: r.name,
      location: r.location,
      country: r.country,
      years:
        r.firstYear === r.lastYear
          ? `${r.firstYear}`
          : `${r.firstYear}\u2013${r.lastYear}`,
      races: r.races,
    }));

    return NextResponse.json(
      { circuits: items },
      {
        headers: {
          "Cache-Control":
            process.env.NODE_ENV === "production"
              ? "public, max-age=3600, s-maxage=3600"
              : "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/circuits]", err);
    return NextResponse.json(
      { error: "Failed to load circuits" },
      { status: 500 }
    );
  }
}
