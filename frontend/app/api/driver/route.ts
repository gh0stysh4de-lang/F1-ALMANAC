import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Single-driver endpoint: identity + career stat totals for the profile header.
//
// Stat logic (agreed):
//   titles   — seasons finished P1 in the final-round driver_standings
//   wins     — results.position = 1
//   podiums  — results.position in (1,2,3)
//   poles    — grid = 1 (primary, all-era) and qualifying P1 (secondary, 1994+)
//   starts   — count of race entries (one row per race; no dedupe needed)
//   points   — race points + sprint points (all points scored on track)
const DRIVER_SQL = `
WITH race AS (
  SELECT
    res.driverId,
    COUNTIF(res.position = 1)                 AS wins,
    COUNTIF(res.position BETWEEN 1 AND 3)      AS podiums,
    COUNTIF(res.grid = 1)                      AS poles_grid,
    COUNT(*)                                   AS starts,
    SUM(res.points)                            AS race_points
  FROM ${fq("results")} res
  WHERE res.driverId = @id
  GROUP BY res.driverId
),
quali AS (
  SELECT driverId, COUNTIF(position = 1) AS poles_quali
  FROM ${fq("qualifying")}
  WHERE driverId = @id
  GROUP BY driverId
),
sprint AS (
  SELECT driverId, SUM(points) AS sprint_points
  FROM ${fq("sprint_results")}
  WHERE driverId = @id
  GROUP BY driverId
),
titles AS (
  SELECT ds.driverId, COUNT(*) AS titles
  FROM ${fq("driver_standings")} ds
  JOIN ${fq("races")} r ON ds.raceId = r.raceId
  WHERE ds.driverId = @id
    AND ds.position = 1
    AND r.round = (
      SELECT MAX(r2.round) FROM ${fq("races")} r2 WHERE r2.year = r.year
    )
  GROUP BY ds.driverId
)
SELECT
  d.driverId,
  d.forename,
  d.surname,
  d.code,
  d.number,
  d.nationality,
  d.dob,
  d.url,
  desc_t.description                                      AS description,
  COALESCE(titles.titles, 0)                              AS titles,
  COALESCE(race.wins, 0)                                  AS wins,
  COALESCE(race.podiums, 0)                               AS podiums,
  COALESCE(race.poles_grid, 0)                            AS poles_grid,
  COALESCE(quali.poles_quali, 0)                          AS poles_quali,
  COALESCE(race.starts, 0)                                AS starts,
  COALESCE(race.race_points, 0)
    + COALESCE(sprint.sprint_points, 0)                   AS points
FROM ${fq("drivers")} d
LEFT JOIN race             ON d.driverId = race.driverId
LEFT JOIN quali            ON d.driverId = quali.driverId
LEFT JOIN sprint           ON d.driverId = sprint.driverId
LEFT JOIN titles           ON d.driverId = titles.driverId
LEFT JOIN ${fq("driver_descriptions")} desc_t ON d.driverId = desc_t.driverId
WHERE d.driverId = @id
LIMIT 1
`;

type DriverRaw = {
  driverId: number;
  forename: unknown;
  surname: unknown;
  code: unknown;
  number: number | null;
  nationality: unknown;
  dob: unknown;
  url: unknown;
  description: unknown;
  titles: number;
  wins: number;
  podiums: number;
  poles_grid: number;
  poles_quali: number;
  starts: number;
  points: number;
};

type DriverProfile = {
  id: number;
  forename: string;
  surname: string;
  name: string;
  code: string | null;
  number: number | null;
  nationality: string | null;
  dob: string | null;
  url: string | null;
  description: string | null; // AI-generated career summary; null if unavailable
  stats: {
    titles: number;
    wins: number;
    podiums: number;
    poles: number; // primary = grid-based
    polesQualifying: number; // secondary = qualifying P1 (for tooltip)
    starts: number;
    points: number;
  };
};

// Ergast CSV uses the literal "\N" as a NULL marker; treat it as empty.
// BigQuery can hand back non-string scalars (e.g. DATE as { value: "..." }),
// so coerce to string defensively instead of assuming .trim() exists.
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // BigQuery DATE/TIMESTAMP come back as objects with a `value` string field.
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = Number(idRaw);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid or missing 'id' query param." },
      { status: 400 }
    );
  }

  try {
    const rows = await query<DriverRaw>(DRIVER_SQL, { id });

    if (rows.length === 0) {
      return NextResponse.json({ error: "Driver not found." }, { status: 404 });
    }

    const r = rows[0];
    const forename = clean(r.forename) ?? "";
    const surname = clean(r.surname) ?? "";
    const profile: DriverProfile = {
      id: Number(r.driverId),
      forename,
      surname,
      name: `${forename} ${surname}`.trim(),
      code: clean(r.code),
      number: r.number === null ? null : Number(r.number),
      nationality: clean(r.nationality),
      dob: clean(r.dob),
      url: clean(r.url),
      description: clean(r.description),
      stats: {
        titles: Number(r.titles),
        wins: Number(r.wins),
        podiums: Number(r.podiums),
        poles: Number(r.poles_grid),
        polesQualifying: Number(r.poles_quali),
        starts: Number(r.starts),
        points: Number(r.points),
      },
    };

    return NextResponse.json(profile, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/driver] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load driver." },
      { status: 500 }
    );
  }
}
