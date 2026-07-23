import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Single-constructor endpoint: identity + career stat totals for the profile
// header. Mirrors /api/driver, but aggregated per team.
//
// Stat logic (mirrors the driver page's agreed conventions):
//   titles   — seasons finished P1 in the final-round constructor_standings
//   wins     — results.position = 1 (each car counts; a 1-2 finish = 1 win)
//   podiums  — results.position in (1,2,3)
//   poles    — results.grid = 1
//   races    — DISTINCT raceId the team entered (drivers share a raceId, so a
//              two-car entry is ONE race, not two)
//   points   — race points + sprint points scored by all the team's cars
//
// Note: there is no constructor_descriptions table (unlike drivers), so the
// profile has no curated biography — the page builds a factual subtitle from
// active years + entries instead.
const CONSTRUCTOR_SQL = `
WITH race AS (
  SELECT
    res.constructorId,
    COUNTIF(res.position = 1)              AS wins,
    COUNTIF(res.position BETWEEN 1 AND 3)  AS podiums,
    COUNTIF(res.grid = 1)                  AS poles,
    COUNT(DISTINCT res.raceId)             AS races,
    SUM(res.points)                        AS race_points
  FROM ${fq("results")} res
  WHERE res.constructorId = @id
  GROUP BY res.constructorId
),
sprint AS (
  SELECT constructorId, SUM(points) AS sprint_points
  FROM ${fq("sprint_results")}
  WHERE constructorId = @id
  GROUP BY constructorId
),
titles AS (
  SELECT cs.constructorId, COUNT(*) AS titles
  FROM ${fq("constructor_standings")} cs
  JOIN ${fq("races")} r ON cs.raceId = r.raceId
  WHERE cs.constructorId = @id
    AND cs.position = 1
    AND r.round = (
      SELECT MAX(r2.round) FROM ${fq("races")} r2 WHERE r2.year = r.year
    )
  GROUP BY cs.constructorId
),
years AS (
  SELECT res.constructorId,
    MIN(r.year) AS first_year,
    MAX(r.year) AS last_year
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE res.constructorId = @id
  GROUP BY res.constructorId
)
SELECT
  c.constructorId,
  c.name,
  c.constructorRef,
  c.nationality,
  c.url,
  COALESCE(titles.titles, 0)                        AS titles,
  COALESCE(race.wins, 0)                            AS wins,
  COALESCE(race.podiums, 0)                         AS podiums,
  COALESCE(race.poles, 0)                           AS poles,
  COALESCE(race.races, 0)                           AS races,
  COALESCE(race.race_points, 0)
    + COALESCE(sprint.sprint_points, 0)             AS points,
  years.first_year,
  years.last_year
FROM ${fq("constructors")} c
LEFT JOIN race    ON c.constructorId = race.constructorId
LEFT JOIN sprint  ON c.constructorId = sprint.constructorId
LEFT JOIN titles  ON c.constructorId = titles.constructorId
LEFT JOIN years   ON c.constructorId = years.constructorId
WHERE c.constructorId = @id
LIMIT 1
`;

type ConstructorRaw = {
  constructorId: number;
  name: unknown;
  constructorRef: unknown;
  nationality: unknown;
  url: unknown;
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  races: number;
  points: number;
  first_year: number | null;
  last_year: number | null;
};

type ConstructorProfile = {
  id: number;
  name: string;
  ref: string | null;
  nationality: string | null;
  url: string | null;
  firstYear: number | null;
  lastYear: number | null;
  stats: {
    titles: number;
    wins: number;
    podiums: number;
    poles: number;
    races: number;
    points: number;
  };
};

// Ergast CSV uses the literal "\N" as a NULL marker; coerce to string defensively.
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
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
    const rows = await query<ConstructorRaw>(CONSTRUCTOR_SQL, { id });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Constructor not found." },
        { status: 404 }
      );
    }

    const r = rows[0];
    const profile: ConstructorProfile = {
      id: Number(r.constructorId),
      name: clean(r.name) ?? "",
      ref: clean(r.constructorRef),
      nationality: clean(r.nationality),
      url: clean(r.url),
      firstYear: r.first_year === null ? null : Number(r.first_year),
      lastYear: r.last_year === null ? null : Number(r.last_year),
      stats: {
        titles: Number(r.titles),
        wins: Number(r.wins),
        podiums: Number(r.podiums),
        poles: Number(r.poles),
        races: Number(r.races),
        points: Number(r.points),
      },
    };

    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/constructor] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load constructor." },
      { status: 500 }
    );
  }
}
