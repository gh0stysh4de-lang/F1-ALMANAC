import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Single-circuit endpoint: identity + KPI totals for the profile header.
// Mirrors /api/constructor.
//
// Stat logic:
//   races    — COUNT(DISTINCT raceId): championship GPs with race results
//   years    — MIN year among completed races, MAX year the circuit is
//              actually SCHEDULED for (see lastScheduledYear below)
//   winners  — COUNT(DISTINCT driverId) with positionOrder = 1
//   alt      — circuits.alt, nullable
//
// Why two different "last year" numbers: completed_races only counts races
// that have a results row, which correctly keeps an unrun future race out of
// the GP count. But that same filter made a circuit on THIS season's calendar
// look retired — its 2026 race has no results yet, so MAX(year) among
// completed races was still 2025, and the page showed "1950–2025" instead of
// "1950–present" for a circuit that's very much still racing. lastScheduledYear
// answers a different question ("is this circuit on the calendar at all,
// results or not") and is what the frontend's "present" check should use —
// firstYear/races/lastYear keep meaning what they already mean.
//
// Why positionOrder = 1 rather than position = 1: results.position is NULL for
// retirements, and while a winner never retires, positionOrder is the field the
// rest of this project standardised on for "first across the line". Keeping it
// consistent avoids the two-numbers-disagree bug we already hit once.
//
// Note `latest` rather than `current` for the CTE name — `current` is a
// reserved word in BigQuery and fails the parse.

const CIRCUIT_SQL = `
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
),
gp AS (
  SELECT
    r.circuitId,
    COUNT(DISTINCT r.raceId) AS races,
    MIN(r.year)              AS firstYear,
    MAX(r.year)              AS lastYear
  FROM completed_races r
  WHERE r.circuitId = @id
  GROUP BY r.circuitId
),
-- Unconditional on results existing: a race scheduled for this year but not
-- yet run still counts here, which is exactly the point.
scheduled AS (
  SELECT
    r.circuitId,
    MAX(r.year) AS lastScheduledYear
  FROM ${fq("races")} r
  WHERE r.circuitId = @id
  GROUP BY r.circuitId
),
winners AS (
  SELECT
    r.circuitId,
    COUNT(DISTINCT res.driverId) AS distinctWinners
  FROM ${fq("results")} res
  JOIN completed_races r ON r.raceId = res.raceId
  WHERE r.circuitId = @id
    AND res.positionOrder = 1
  GROUP BY r.circuitId
)
SELECT
  c.circuitId  AS id,
  c.circuitRef AS ref,
  c.name       AS name,
  c.location   AS location,
  c.country    AS country,
  c.lat        AS lat,
  c.lng        AS lng,
  c.alt        AS alt,
  c.url        AS url,
  gp.races               AS races,
  gp.firstYear           AS firstYear,
  gp.lastYear            AS lastYear,
  scheduled.lastScheduledYear AS lastScheduledYear,
  winners.distinctWinners AS distinctWinners
FROM ${fq("circuits")} c
LEFT JOIN gp        ON gp.circuitId = c.circuitId
LEFT JOIN scheduled ON scheduled.circuitId = c.circuitId
LEFT JOIN winners   ON winners.circuitId = c.circuitId
WHERE c.circuitId = @id
LIMIT 1
`;

type Row = {
  id: number;
  ref: string;
  name: string;
  location: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  url: string | null;
  races: number | null;
  firstYear: number | null;
  lastYear: number | null;
  lastScheduledYear: number | null;
  distinctWinners: number | null;
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
    const rows = await query<Row>(CIRCUIT_SQL, { id });
    const row = rows[0];

    if (!row) {
      return NextResponse.json({ error: "Circuit not found" }, { status: 404 });
    }

    return NextResponse.json({
      circuit: {
        id: row.id,
        ref: row.ref,
        name: row.name,
        location: row.location,
        country: row.country,
        lat: row.lat,
        lng: row.lng,
        alt: row.alt,
        url: row.url,
        races: row.races ?? 0,
        firstYear: row.firstYear,
        lastYear: row.lastYear,
        lastScheduledYear: row.lastScheduledYear,
        distinctWinners: row.distinctWinners ?? 0,
      },
    });
  } catch (err) {
    console.error("[/api/circuit]", err);
    return NextResponse.json(
      { error: "Failed to load circuit" },
      { status: 500 }
    );
  }
}
