import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { teamColor } from "@/lib/team-colors";

// A driver's 3-letter code may be missing, empty, or the Ergast NULL marker "\\N".
function cleanCode(code: string | null): string | null {
  if (!code) return null;
  const t = code.trim();
  if (!t || t === "\\N") return null;
  return t;
}
function shortLabel(surname: string): string {
  const letters = surname.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || surname.slice(0, 3)).toUpperCase();
}


const REF_TO_KEY: Record<string, string> = {
  red_bull: "RedBull",
  mclaren: "McLaren",
  ferrari: "Ferrari",
  mercedes: "Mercedes",
  aston_martin: "Aston",
  alpine: "Alpine",
  williams: "Williams",
  rb: "RB",
  toro_rosso: "RB",
  alphatauri: "RB",
  haas: "Haas",
  sauber: "Sauber",
  alfa: "Sauber",
};

function teamKey(ref: string | null): string | null {
  if (ref && REF_TO_KEY[ref]) return REF_TO_KEY[ref];
  return ref;
}

// Top-5 drivers by final standings, with their last team (for color/primary).
const TOP5_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId WHERE r.year = @season
),
last_team AS (
  SELECT driverId, constructorId FROM (
    SELECT res.driverId, res.constructorId,
      ROW_NUMBER() OVER (PARTITION BY res.driverId ORDER BY r.round DESC) AS rn
    FROM ${fq("results")} res
    JOIN ${fq("races")} r ON res.raceId = r.raceId
    WHERE r.year = @season
  ) WHERE rn = 1
)
SELECT
  d.driverId AS driverId,
  d.code AS code,
  d.surname AS surname,
  con.constructorRef AS teamRef,
  con.constructorId AS constructorId,
  ds.position AS position
FROM ${fq("driver_standings")} ds
JOIN ${fq("races")} r       ON ds.raceId = r.raceId
JOIN ${fq("drivers")} d     ON ds.driverId = d.driverId
LEFT JOIN last_team lt      ON lt.driverId = ds.driverId
LEFT JOIN ${fq("constructors")} con ON con.constructorId = lt.constructorId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY ds.position
LIMIT 5
`;

// Cumulative points per round for the given drivers (from driver_standings).
const TRAJECTORY_SQL = `
SELECT ds.driverId AS driverId, r.round AS round, ds.points AS points
FROM ${fq("driver_standings")} ds
JOIN ${fq("races")} r ON ds.raceId = r.raceId
WHERE r.year = @season AND ds.driverId IN UNNEST(@driverIds)
ORDER BY r.round
`;

// Podium counts (W / P2 / P3) for races and sprints, per driver.
const PODIUMS_SQL = `
WITH race_pod AS (
  SELECT res.driverId AS driverId,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 1) AS w,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 2) AS p2,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 3) AS p3
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
  GROUP BY res.driverId
),
spr_pod AS (
  SELECT sp.driverId AS driverId,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 1) AS w,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 2) AS p2,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 3) AS p3
  FROM ${fq("sprint_results")} sp
  JOIN ${fq("races")} r ON sp.raceId = r.raceId
  WHERE r.year = @season
  GROUP BY sp.driverId
),
last_team AS (
  SELECT driverId, constructorId FROM (
    SELECT res.driverId, res.constructorId,
      ROW_NUMBER() OVER (PARTITION BY res.driverId ORDER BY r.round DESC) AS rn
    FROM ${fq("results")} res
    JOIN ${fq("races")} r ON res.raceId = r.raceId
    WHERE r.year = @season
  ) WHERE rn = 1
)
SELECT
  d.surname AS name,
  con.constructorRef AS teamRef,
  COALESCE(rp.w, 0)  AS raceW,
  COALESCE(rp.p2, 0) AS raceP2,
  COALESCE(rp.p3, 0) AS raceP3,
  COALESCE(spr.w, 0)  AS sprW,
  COALESCE(spr.p2, 0) AS sprP2,
  COALESCE(spr.p3, 0) AS sprP3
FROM race_pod rp
JOIN ${fq("drivers")} d ON rp.driverId = d.driverId
LEFT JOIN spr_pod spr   ON spr.driverId = rp.driverId
LEFT JOIN last_team lt  ON lt.driverId = rp.driverId
LEFT JOIN ${fq("constructors")} con ON con.constructorId = lt.constructorId
WHERE (COALESCE(rp.w,0)+COALESCE(rp.p2,0)+COALESCE(rp.p3,0)
     + COALESCE(spr.w,0)+COALESCE(spr.p2,0)+COALESCE(spr.p3,0)) > 0
ORDER BY raceW DESC, raceP2 DESC, raceP3 DESC
`;

type Top5Row = {
  driverId: number;
  code: string | null;
  surname: string;
  teamRef: string | null;
  constructorId: number | null;
  position: number;
};
type TrajRow = { driverId: number; round: number; points: number };
type PodRow = {
  name: string;
  teamRef: string | null;
  raceW: number; raceP2: number; raceP3: number;
  sprW: number; sprP2: number; sprP3: number;
};

// ---- Constructor-mode SQL ----

// Top-5 constructors by final standings.
const TOP5_CON_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId WHERE r.year = @season
)
SELECT
  con.constructorId AS constructorId,
  con.constructorRef AS teamRef,
  con.name AS name,
  cs.position AS position
FROM ${fq("constructor_standings")} cs
JOIN ${fq("races")} r          ON cs.raceId = r.raceId
JOIN ${fq("constructors")} con ON cs.constructorId = con.constructorId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY cs.position
LIMIT 5
`;

// Cumulative points per round for given constructors.
const TRAJECTORY_CON_SQL = `
SELECT cs.constructorId AS constructorId, r.round AS round, cs.points AS points
FROM ${fq("constructor_standings")} cs
JOIN ${fq("races")} r ON cs.raceId = r.raceId
WHERE r.year = @season AND cs.constructorId IN UNNEST(@constructorIds)
ORDER BY r.round
`;

// Podiums per constructor = sum of its drivers' top-3 finishes (race + sprint).
// A 1-2 finish counts as one win + one second for the team.
const PODIUMS_CON_SQL = `
WITH race_pod AS (
  SELECT res.constructorId AS constructorId,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 1) AS w,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 2) AS p2,
    COUNTIF(SAFE_CAST(res.position AS INT64) = 3) AS p3
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
  GROUP BY res.constructorId
),
spr_pod AS (
  SELECT sp.constructorId AS constructorId,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 1) AS w,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 2) AS p2,
    COUNTIF(SAFE_CAST(sp.position AS INT64) = 3) AS p3
  FROM ${fq("sprint_results")} sp
  JOIN ${fq("races")} r ON sp.raceId = r.raceId
  WHERE r.year = @season
  GROUP BY sp.constructorId
)
SELECT
  con.name AS name,
  con.constructorRef AS teamRef,
  COALESCE(rp.w, 0)  AS raceW,
  COALESCE(rp.p2, 0) AS raceP2,
  COALESCE(rp.p3, 0) AS raceP3,
  COALESCE(spr.w, 0)  AS sprW,
  COALESCE(spr.p2, 0) AS sprP2,
  COALESCE(spr.p3, 0) AS sprP3
FROM race_pod rp
JOIN ${fq("constructors")} con ON rp.constructorId = con.constructorId
LEFT JOIN spr_pod spr ON spr.constructorId = rp.constructorId
WHERE (COALESCE(rp.w,0)+COALESCE(rp.p2,0)+COALESCE(rp.p3,0)
     + COALESCE(spr.w,0)+COALESCE(spr.p2,0)+COALESCE(spr.p3,0)) > 0
ORDER BY raceW DESC, raceP2 DESC, raceP3 DESC
`;

type Top5ConRow = {
  constructorId: number;
  teamRef: string | null;
  name: string;
  position: number;
};
type TrajConRow = { constructorId: number; round: number; points: number };

// Short label for a constructor line in the cumulative chart.
const TEAM_LABEL: Record<string, string> = {
  RedBull: "RBR",
  McLaren: "MCL",
  Ferrari: "FER",
  Mercedes: "MER",
  Aston: "AST",
  Alpine: "ALP",
  Williams: "WIL",
  RB: "RB",
  Haas: "HAA",
  Sauber: "SAU",
};
function teamLabel(ref: string | null): string {
  const key = teamKey(ref);
  if (key && TEAM_LABEL[key]) return TEAM_LABEL[key];
  return (key ?? ref ?? "—").slice(0, 3).toUpperCase();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get("season"));
  const mode = searchParams.get("mode") === "constructors" ? "constructors" : "drivers";
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    return NextResponse.json({ error: "Invalid 'season'." }, { status: 400 });
  }

  // Carry-forward cumulative series over a fixed list of rounds.
  function buildCumulative(
    pointsByRound: Map<number, number>,
    rounds: number[]
  ): number[] {
    let last = 0;
    return rounds.map((rd) => {
      const v = pointsByRound.get(rd);
      if (v !== undefined) last = v;
      return last;
    });
  }

  try {
    if (mode === "constructors") {
      const top5 = await query<Top5ConRow>(TOP5_CON_SQL, { season });
      const constructorIds = top5.map((c) => c.constructorId);

      const [traj, pods] = await Promise.all([
        constructorIds.length
          ? query<TrajConRow>(TRAJECTORY_CON_SQL, { season, constructorIds })
          : Promise.resolve([] as TrajConRow[]),
        query<PodRow>(PODIUMS_CON_SQL, { season }),
      ]);

      const roundsSet = new Set<number>();
      traj.forEach((t) => roundsSet.add(t.round));
      const rounds = Array.from(roundsSet).sort((a, b) => a - b);

      const byTeam = new Map<number, Map<number, number>>();
      for (const t of traj) {
        let m = byTeam.get(t.constructorId);
        if (!m) {
          m = new Map();
          byTeam.set(t.constructorId, m);
        }
        m.set(t.round, Number(t.points));
      }

      const trajectory = top5.map((c) => ({
        code: teamLabel(c.teamRef), // short team label, e.g. "MCL"
        team: teamKey(c.teamRef),
        color: teamColor(c.teamRef, season),
        primary: true, // constructors: every line solid
        cumulative: buildCumulative(byTeam.get(c.constructorId) ?? new Map(), rounds),
      }));

      const podiums = pods.map((p) => ({
        name: p.name,
        team: teamKey(p.teamRef),
        color: teamColor(p.teamRef, season),
        raceW: Number(p.raceW), raceP2: Number(p.raceP2), raceP3: Number(p.raceP3),
        sprW: Number(p.sprW), sprP2: Number(p.sprP2), sprP3: Number(p.sprP3),
      }));

      return NextResponse.json(
        { rounds, trajectory, podiums },
        { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
      );
    }

    // ---- drivers mode (default) ----
    const top5 = await query<Top5Row>(TOP5_SQL, { season });
    const driverIds = top5.map((d) => d.driverId);

    const [traj, pods] = await Promise.all([
      driverIds.length
        ? query<TrajRow>(TRAJECTORY_SQL, { season, driverIds })
        : Promise.resolve([] as TrajRow[]),
      query<PodRow>(PODIUMS_SQL, { season }),
    ]);

    const roundsSet = new Set<number>();
    traj.forEach((t) => roundsSet.add(t.round));
    const rounds = Array.from(roundsSet).sort((a, b) => a - b);

    const pointsByDriver = new Map<number, Map<number, number>>();
    for (const t of traj) {
      let m = pointsByDriver.get(t.driverId);
      if (!m) {
        m = new Map();
        pointsByDriver.set(t.driverId, m);
      }
      m.set(t.round, Number(t.points));
    }

    const seenTeam = new Set<number | string>();
    const trajectory = top5.map((d) => {
      const teamId = d.constructorId ?? d.teamRef ?? d.driverId;
      const isPrimary = !seenTeam.has(teamId);
      seenTeam.add(teamId);
      return {
        code: cleanCode(d.code) ?? shortLabel(d.surname),
        team: teamKey(d.teamRef),
        color: teamColor(d.teamRef, season),
        primary: isPrimary,
        cumulative: buildCumulative(pointsByDriver.get(d.driverId) ?? new Map(), rounds),
      };
    });

    // Ensure unique display codes (two code-less drivers could share a label),
    // so Recharts dataKeys never collide and every line renders.
    {
      const seen = new Map<string, number>();
      for (const d of trajectory) {
        const base = d.code;
        const n = seen.get(base) ?? 0;
        if (n > 0) d.code = base.slice(0, 2) + String(n);
        seen.set(base, n + 1);
      }
    }

    const podiums = pods.map((p) => ({
      name: p.name,
      team: teamKey(p.teamRef),
      color: teamColor(p.teamRef, season),
      raceW: Number(p.raceW),
      raceP2: Number(p.raceP2),
      raceP3: Number(p.raceP3),
      sprW: Number(p.sprW),
      sprP2: Number(p.sprP2),
      sprP3: Number(p.sprP3),
    }));

    return NextResponse.json(
      { rounds, trajectory, podiums },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("[/api/momentum] query failed:", err);
    return NextResponse.json({ error: "Failed to load momentum." }, { status: 500 });
  }
}
