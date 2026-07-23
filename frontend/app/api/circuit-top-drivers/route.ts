import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Top 5 drivers by wins at this circuit, with podiums, poles, sprint wins, and
// percentages against the relevant denominator.
//
// Metric definitions match CONSTRUCTORS_PAGE.md, which is the existing
// authority for this project:
//   Wins    — results.position = 1 (a winner always finishes, so this is safe)
//   Podiums — results.position BETWEEN 1 AND 3 (same reasoning)
//   Poles   — qualifying.position = 1
// Sprint wins use positionOrder = 1, per the project's own documented gotcha:
// sprint_results.position is nullable for retirements; positionOrder is not.
//
// Percentages:
//   winPct / podiumPct   — against RACE starts here (COUNT DISTINCT raceId
//                          from results). "What share of Grands Prix here did
//                          this driver win / podium."
//   sprintWinPct         — against SPRINT starts here, not race starts. Most
//                          circuits never held a sprint, and a driver with 15
//                          race entries might have exactly one sprint start —
//                          dividing by 15 would make that one win read as 7%
//                          instead of the correct 100%.
//
// sprintWins is null (not 0) when the driver never started a sprint at this
// circuit — the client renders that as "—" rather than "0", since 0 implies
// they tried and failed, and null means the format didn't exist for them here.

const TOP_DRIVERS_SQL = `
WITH starts AS (
  SELECT res.driverId, COUNT(DISTINCT res.raceId) AS starts
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id
  GROUP BY res.driverId
),
wins AS (
  SELECT res.driverId, COUNT(*) AS wins
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.position = 1
  GROUP BY res.driverId
),
podiums AS (
  SELECT res.driverId, COUNT(*) AS podiums
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.position BETWEEN 1 AND 3
  GROUP BY res.driverId
),
poles AS (
  SELECT q.driverId, COUNT(*) AS poles
  FROM ${fq("qualifying")} q
  JOIN ${fq("races")} r ON r.raceId = q.raceId
  WHERE r.circuitId = @id AND q.position = 1
  GROUP BY q.driverId
),
sprint_starts AS (
  SELECT sr.driverId, COUNT(DISTINCT sr.raceId) AS sprintStarts
  FROM ${fq("sprint_results")} sr
  JOIN ${fq("races")} r ON r.raceId = sr.raceId
  WHERE r.circuitId = @id
  GROUP BY sr.driverId
),
sprint_wins AS (
  SELECT sr.driverId, COUNT(*) AS sprintWins
  FROM ${fq("sprint_results")} sr
  JOIN ${fq("races")} r ON r.raceId = sr.raceId
  WHERE r.circuitId = @id AND sr.positionOrder = 1
  GROUP BY sr.driverId
),
-- The team stripe shows the constructor the driver most recently raced for AT
-- THIS CIRCUIT, not their current F1 team — most drivers with history here
-- aren't on the current grid at all. Ranking by (year, round) descending and
-- taking row 1 avoids a correlated subquery (BigQuery chokes on those against
-- CTEs, per this project's own notes) in favour of a plain window + join.
latest_team_ranked AS (
  SELECT
    res.driverId,
    c.constructorRef,
    r.year,
    ROW_NUMBER() OVER (
      PARTITION BY res.driverId ORDER BY r.year DESC, r.round DESC
    ) AS rn
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  JOIN ${fq("constructors")} c ON c.constructorId = res.constructorId
  WHERE r.circuitId = @id
),
latest_team AS (
  SELECT driverId, constructorRef, year
  FROM latest_team_ranked
  WHERE rn = 1
)
SELECT
  d.driverId       AS driverId,
  d.code           AS code,
  d.forename       AS forename,
  d.surname        AS surname,
  st.starts        AS starts,
  COALESCE(w.wins, 0)       AS wins,
  COALESCE(p.podiums, 0)    AS podiums,
  COALESCE(pl.poles, 0)     AS poles,
  sprst.sprintStarts        AS sprintStarts,
  sw.sprintWins             AS sprintWins,
  lt.constructorRef         AS constructorRef,
  lt.year                   AS lastYear
FROM starts st
JOIN ${fq("drivers")} d ON d.driverId = st.driverId
LEFT JOIN wins w            ON w.driverId = st.driverId
LEFT JOIN podiums p         ON p.driverId = st.driverId
LEFT JOIN poles pl          ON pl.driverId = st.driverId
LEFT JOIN sprint_starts sprst ON sprst.driverId = st.driverId
LEFT JOIN sprint_wins sw    ON sw.driverId = st.driverId
LEFT JOIN latest_team lt    ON lt.driverId = st.driverId
ORDER BY
  wins DESC,
  podiums DESC,
  poles DESC,
  COALESCE(sw.sprintWins, 0) DESC
LIMIT 5
`;

type Row = {
  driverId: number;
  code: string | null;
  forename: string;
  surname: string;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintStarts: number | null;
  sprintWins: number | null;
  constructorRef: string | null;
  lastYear: number | null;
};

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

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
    const rows = await query<Row>(TOP_DRIVERS_SQL, { id });

    const drivers = rows.map((r) => {
      const hadSprint = (r.sprintStarts ?? 0) > 0;
      return {
        driverId: r.driverId,
        code: r.code ?? r.surname.slice(0, 3).toUpperCase(),
        name: `${r.forename} ${r.surname}`,
        constructorRef: r.constructorRef,
        lastYear: r.lastYear,
        starts: r.starts,
        wins: r.wins,
        winPct: pct(r.wins, r.starts),
        podiums: r.podiums,
        podiumPct: pct(r.podiums, r.starts),
        poles: r.poles,
        // null (not 0) when the format never happened for this driver here —
        // the client shows "—", distinct from a genuine 0-for-N record.
        sprintWins: hadSprint ? r.sprintWins ?? 0 : null,
        sprintWinPct: hadSprint ? pct(r.sprintWins ?? 0, r.sprintStarts!) : null,
      };
    });

    return NextResponse.json(
      { drivers },
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
    console.error("[/api/circuit-top-drivers]", err);
    return NextResponse.json(
      { error: "Failed to load top drivers" },
      { status: 500 }
    );
  }
}
