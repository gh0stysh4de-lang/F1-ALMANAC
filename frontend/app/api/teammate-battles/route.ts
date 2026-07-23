import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { teamColor } from "@/lib/team-colors";

// Teammate battles endpoint: per-season head-to-head of the driver against
// ALL of his teammates combined (results summed across whoever partnered him
// that year), split into Race H2H and Qualifying H2H.
//
// Race H2H counts only races where BOTH the driver and the teammate finished
// (status Finished or +N Laps) — cleaner than adjudicating who "beat" whom on
// a double DNF. Whoever placed higher (lower positionOrder) wins the race duel.
//
// Qualifying H2H counts every shared session where both set a grid position.
// Note: the qualifying table only starts in 1994, so pre-1994 seasons return 0.
//
// team / teamColor = the constructor the driver entered the most races with
// that season (majority of starts, matching the timeline logic).
// teammates = distinct teammate surnames that year, most-raced first.

const BATTLES_SQL = `
WITH driver_races AS (
  SELECT r.raceId, r.year, res.constructorId,
    res.positionOrder AS driver_pos,
    (s.status = 'Finished' OR s.status LIKE '%Lap%') AS driver_finished
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  JOIN ${fq("status")} s ON res.statusId = s.statusId
  WHERE res.driverId = @id
),
race_h2h AS (
  SELECT dr.year,
    COUNTIF(dr.driver_finished AND (s.status='Finished' OR s.status LIKE '%Lap%') AND dr.driver_pos < res.positionOrder) AS r_driver,
    COUNTIF(dr.driver_finished AND (s.status='Finished' OR s.status LIKE '%Lap%') AND res.positionOrder < dr.driver_pos) AS r_tm
  FROM driver_races dr
  JOIN ${fq("results")} res
    ON res.raceId = dr.raceId AND res.constructorId = dr.constructorId AND res.driverId != @id
  JOIN ${fq("status")} s ON res.statusId = s.statusId
  GROUP BY dr.year
),
driver_quali AS (
  SELECT q.raceId, r.year, res.constructorId, q.position AS driver_pos
  FROM ${fq("qualifying")} q
  JOIN ${fq("races")} r ON q.raceId = r.raceId
  JOIN ${fq("results")} res ON res.raceId = q.raceId AND res.driverId = q.driverId
  WHERE q.driverId = @id AND q.position IS NOT NULL
),
quali_h2h AS (
  SELECT dq.year,
    COUNTIF(dq.driver_pos < q2.position) AS q_driver,
    COUNTIF(q2.position < dq.driver_pos) AS q_tm
  FROM driver_quali dq
  JOIN ${fq("results")} res2
    ON res2.raceId = dq.raceId AND res2.constructorId = dq.constructorId AND res2.driverId != @id
  JOIN ${fq("qualifying")} q2
    ON q2.raceId = dq.raceId AND q2.driverId = res2.driverId AND q2.position IS NOT NULL
  GROUP BY dq.year
),
team_by_year AS (
  SELECT dr.year, c.constructorRef, c.name AS team,
    ROW_NUMBER() OVER (PARTITION BY dr.year ORDER BY COUNT(*) DESC) AS rn
  FROM driver_races dr
  JOIN ${fq("constructors")} c ON dr.constructorId = c.constructorId
  GROUP BY dr.year, c.constructorRef, c.name
),
mates AS (
  SELECT dr.year, d.surname, COUNT(*) AS n
  FROM driver_races dr
  JOIN ${fq("results")} res
    ON res.raceId = dr.raceId AND res.constructorId = dr.constructorId AND res.driverId != @id
  JOIN ${fq("drivers")} d ON res.driverId = d.driverId
  GROUP BY dr.year, d.surname
),
mate_list AS (
  SELECT year,
    TO_JSON_STRING(
      ARRAY_AGG(STRUCT(surname AS name, n AS races) ORDER BY n DESC)
    ) AS teammates_json
  FROM mates GROUP BY year
)
SELECT
  rh.year,
  rh.r_driver, rh.r_tm,
  COALESCE(qh.q_driver, 0) AS q_driver,
  COALESCE(qh.q_tm, 0) AS q_tm,
  tby.team, tby.constructorRef AS team_ref,
  ml.teammates_json
FROM race_h2h rh
LEFT JOIN quali_h2h qh ON rh.year = qh.year
JOIN team_by_year tby ON rh.year = tby.year AND tby.rn = 1
JOIN mate_list ml ON rh.year = ml.year
ORDER BY rh.year
`;

type BattleRow = {
  year: number | string;
  r_driver: number | string;
  r_tm: number | string;
  q_driver: number | string;
  q_tm: number | string;
  team: string | null;
  team_ref: string | null;
  teammates_json: string | null;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
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
    const rows = await query<BattleRow>(BATTLES_SQL, { id });

    const seasons = rows.map((row) => {
      const year = num(row.year);
      const team = row.team ?? "Unknown";
      const color = teamColor(row.team_ref, year);
      // teammates_json is a JSON array [{name, races}], most-raced first
      let teammates: { name: string; races: number }[] = [];
      if (row.teammates_json) {
        try {
          const parsed = JSON.parse(row.teammates_json) as {
            name: string;
            races: number | string;
          }[];
          teammates = parsed.map((t) => ({
            name: t.name,
            races: num(t.races),
          }));
        } catch {
          teammates = [];
        }
      }
      return {
        season: year,
        // Rivalry is summed across all partners, so there is no single code:
        // the table shows a generic "TM"; the tooltip lists the actual names.
        teammates,
        team,
        teamColor: color,
        race: { driver: num(row.r_driver), teammate: num(row.r_tm) },
        qualifying: { driver: num(row.q_driver), teammate: num(row.q_tm) },
      };
    });

    return NextResponse.json(
      { seasons },
      {
        headers: {
          // current season updates weekly; keep it fresh in dev
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/teammate-battles] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load teammate battles." },
      { status: 500 }
    );
  }
}
