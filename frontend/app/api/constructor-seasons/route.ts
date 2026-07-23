import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Per-season data for one constructor, feeding both the Championship Trajectory
// (bars + hover card) and the Performance Profile heatmap.
//
// For each season the team competed in, we return:
//   position  — final championship position (last round of the season)
//   points    — championship points that season
//   races     — DISTINCT races the team entered (denominator for rates)
//   wins/podiums/poles — race-result counts that season
//   pointFinishes      — entries that scored (points > 0), for "points finish rate"
//   drivers   — the drivers who raced for the team that season (for the hover card)
//   isLive    — true for the current (possibly unfinished) season
//
// Rates are computed here (not in the client) so the heatmap and any future
// consumer agree. All rates are per race entry, making eras comparable despite
// changing points systems and calendar lengths.
const SEASONS_SQL = `
WITH team_races AS (
  SELECT
    r.year,
    res.raceId,
    res.driverId,
    res.position,
    res.grid,
    res.points
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE res.constructorId = @id
),
per_season AS (
  SELECT
    year,
    COUNT(DISTINCT raceId)               AS races,      -- weekends entered
    COUNT(*)                             AS entries,     -- car-entries (>= races)
    COUNTIF(position = 1)                AS wins,
    COUNTIF(position BETWEEN 1 AND 3)    AS podiums,
    COUNTIF(grid = 1)                    AS poles,
    COUNTIF(points > 0)                  AS point_finishes
  FROM team_races
  GROUP BY year
),
final_round AS (
  SELECT r.year, MAX(r.round) AS max_round
  FROM ${fq("constructor_standings")} cs
  JOIN ${fq("races")} r ON cs.raceId = r.raceId
  WHERE cs.constructorId = @id
  GROUP BY r.year
),
standings AS (
  SELECT r.year, cs.position, cs.points
  FROM ${fq("constructor_standings")} cs
  JOIN ${fq("races")} r ON cs.raceId = r.raceId
  JOIN final_round fr ON fr.year = r.year AND fr.max_round = r.round
  WHERE cs.constructorId = @id
),
season_drivers AS (
  SELECT
    year,
    ARRAY_AGG(
      STRUCT(forename, surname, code)
      ORDER BY entries DESC
      LIMIT 4          -- season's main drivers; ignore one-off stand-ins
    ) AS drivers
  FROM (
    SELECT
      tr.year,
      tr.driverId,
      d.forename,
      d.surname,
      d.code,
      COUNT(*) AS entries
    FROM team_races tr
    JOIN ${fq("drivers")} d ON tr.driverId = d.driverId
    GROUP BY tr.year, tr.driverId, d.forename, d.surname, d.code
  )
  GROUP BY year
),
latest_season AS (
  SELECT MAX(year) AS yr FROM ${fq("races")}
)
SELECT
  ps.year,
  st.position,
  COALESCE(st.points, 0)                  AS points,
  ps.races,
  ps.entries,
  ps.wins,
  ps.podiums,
  ps.poles,
  ps.point_finishes,
  (ps.year = cur.yr)                       AS is_live,
  COALESCE(sd.drivers, [])                 AS drivers
FROM per_season ps
LEFT JOIN standings st ON st.year = ps.year
LEFT JOIN season_drivers sd ON sd.year = ps.year
CROSS JOIN latest_season cur
ORDER BY ps.year
`;

type RawDriver = { forename: unknown; surname: unknown; code: unknown };

type Raw = {
  year: number;
  position: number | null;
  points: number | null;
  races: number;
  entries: number;
  wins: number;
  podiums: number;
  poles: number;
  point_finishes: number;
  is_live: boolean | null;
  drivers: RawDriver[];
};

type SeasonDriver = { name: string; code: string | null };

type SeasonEntry = {
  year: number;
  position: number | null;
  points: number;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  // Rates are 0..1, per race entry (car-entries), so a two-car team isn't
  // double-counted relative to its own opportunities.
  winRate: number;
  podiumRate: number;
  poleRate: number;
  pointsRate: number;
  drivers: SeasonDriver[];
  isLive: boolean;
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

function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && "value" in v) {
    return Boolean((v as { value: unknown }).value);
  }
  return Boolean(v);
}

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
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
    const rows = await query<Raw>(SEASONS_SQL, { id });

    const seasons: SeasonEntry[] = rows.map((r) => {
      const entries = Number(r.entries) || 0;
      return {
        year: Number(r.year),
        position: r.position === null ? null : Number(r.position),
        points: Number(r.points ?? 0),
        races: Number(r.races),
        wins: Number(r.wins),
        podiums: Number(r.podiums),
        poles: Number(r.poles),
        winRate: rate(Number(r.wins), entries),
        podiumRate: rate(Number(r.podiums), entries),
        poleRate: rate(Number(r.poles), entries),
        pointsRate: rate(Number(r.point_finishes), entries),
        drivers: (r.drivers ?? []).map((d) => {
          const forename = clean(d.forename) ?? "";
          const surname = clean(d.surname) ?? "";
          return {
            name: `${forename} ${surname}`.trim(),
            code: clean(d.code),
          };
        }),
        isLive: bool(r.is_live),
      };
    });

    return NextResponse.json(
      { seasons },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[/api/constructor-seasons] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load constructor seasons." },
      { status: 500 }
    );
  }
}
