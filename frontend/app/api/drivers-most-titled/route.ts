import { NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Top 10 drivers by World Championship title count — computed from
// driver_standings, not hardcoded from memory. Relying on memory for this
// exact kind of stat is precisely what this project avoids elsewhere (see
// the AI chat's system prompt instruction to trust the database over
// training knowledge for standings-shaped questions); title counts are no
// different, and drift the moment a new season crowns a champion.
//
// A season's champion is whoever holds position = 1 in driver_standings at
// that season's FINAL round — the same rule this project's own SQL
// conventions already document for "final standings" queries elsewhere.
//
// Ties at the cutoff: with real F1 history, several drivers sit on the same
// title count around the tail of a top-10 cut (a cluster of 3-time champions
// is common). LIMIT 10 with a wins-based tiebreak resolves this
// deterministically, but "exactly 10" is a display choice, not a claim that
// the 10th and 11th are meaningfully different — the client should not
// present the cutoff as more precise than it is.
const TOP_TITLED_SQL = `
WITH final_round AS (
  SELECT r.year, MAX(r.round) AS round
  FROM ${fq("races")} r
  GROUP BY r.year
),
champions AS (
  SELECT ds.driverId, r.year
  FROM ${fq("driver_standings")} ds
  JOIN ${fq("races")} r ON r.raceId = ds.raceId
  JOIN final_round fr ON fr.year = r.year AND fr.round = r.round
  WHERE ds.position = 1
),
title_counts AS (
  SELECT driverId, COUNT(*) AS titles, MIN(year) AS firstTitleYear, MAX(year) AS lastTitleYear
  FROM champions
  GROUP BY driverId
),
-- Tiebreak by career wins (position = 1 in results), not an arbitrary id
-- order — two drivers on the same title count should sort by the next most
-- meaningful signal, not by whichever happened to load first.
wins AS (
  SELECT driverId, COUNT(*) AS wins
  FROM ${fq("results")}
  WHERE position = 1
  GROUP BY driverId
)
SELECT
  d.driverId AS id,
  d.code AS code,
  CONCAT(d.forename, ' ', d.surname) AS name,
  d.nationality AS nationality,
  tc.titles AS titles,
  tc.firstTitleYear AS firstTitleYear,
  tc.lastTitleYear AS lastTitleYear
FROM title_counts tc
JOIN ${fq("drivers")} d ON d.driverId = tc.driverId
LEFT JOIN wins w ON w.driverId = tc.driverId
ORDER BY tc.titles DESC, COALESCE(w.wins, 0) DESC
LIMIT 10
`;

type Row = {
  id: number;
  code: unknown;
  name: unknown;
  nationality: unknown;
  titles: number;
  firstTitleYear: number;
  lastTitleYear: number;
};

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
}

export async function GET() {
  try {
    const rows = await query<Row>(TOP_TITLED_SQL);

    const drivers = rows.map((r) => ({
      id: Number(r.id),
      code: clean(r.code) ?? "",
      name: clean(r.name) ?? "",
      nationality: clean(r.nationality),
      titles: Number(r.titles),
      firstTitleYear: Number(r.firstTitleYear),
      lastTitleYear: Number(r.lastTitleYear),
    }));

    return NextResponse.json(
      { drivers },
      // Cache hard: title counts only change once a year, at a season's
      // final round.
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    console.error("[/api/drivers-most-titled] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load most-titled drivers.", drivers: [] },
      { status: 500 }
    );
  }
}
