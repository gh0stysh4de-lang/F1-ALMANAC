import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Top 5 drivers OR constructors at a circuit (mode switch), each with wins,
// podiums, poles, sprint wins, percentages, and a hover breakdown.
//
// The breakdown answers "when" for each kind of result, not just "how many
// with whom": for a driver, which team they won with and in which years,
// separately from which team they podiumed or poled with (podium years
// include win years — a win IS a podium, matching this project's own
// Podiums = position BETWEEN 1 AND 3 definition, so a win row counts toward
// both). For a constructor, the same breakdown but keyed by driver instead of
// team. Four possible lines per group: Win / Podium / Pole / Sprint win, each
// with its own year list — never merged into one summary line, since
// "3W · 2P · 1Pl" hides exactly the "when" the tooltip exists to answer.
//
// Metric definitions match CONSTRUCTORS_PAGE.md, the existing authority for
// this project:
//   Wins    — results.position = 1
//   Podiums — results.position BETWEEN 1 AND 3
//   Poles   — qualifying.position = 1
// Sprint wins use positionOrder = 1 (sprint_results.position is nullable for
// retirements; positionOrder is not — same gotcha already documented there).
//
// Percentages:
//   winPct / podiumPct — against race starts here.
//   sprintWinPct        — against SPRINT starts here, not race starts. A
//                         driver can have 15 race entries and exactly one
//                         sprint start; dividing that one win by 15 would
//                         read as 7% instead of the correct 100%.
//
// Two round trips rather than one nested query: get the top 5 ids first, then
// fetch the breakdown filtered to just those ids. Keeps both queries simple
// flat SELECTs — no ARRAY_AGG(STRUCT(...)) whose shape through the BigQuery
// Node client would need separate verification, and no correlated subqueries
// against a CTE, which this project's own notes flag as unreliable in
// BigQuery.

type Mode = "drivers" | "constructors";

const TOP_ENTITY_SQL: Record<Mode, string> = {
  drivers: `
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
)
SELECT
  d.driverId    AS id,
  d.code        AS code,
  CONCAT(d.forename, ' ', d.surname) AS name,
  st.starts     AS starts,
  COALESCE(w.wins, 0)    AS wins,
  COALESCE(p.podiums, 0) AS podiums,
  COALESCE(pl.poles, 0)  AS poles,
  sprst.sprintStarts     AS sprintStarts,
  sw.sprintWins          AS sprintWins
FROM starts st
JOIN ${fq("drivers")} d ON d.driverId = st.driverId
LEFT JOIN wins w              ON w.driverId = st.driverId
LEFT JOIN podiums p           ON p.driverId = st.driverId
LEFT JOIN poles pl            ON pl.driverId = st.driverId
LEFT JOIN sprint_starts sprst ON sprst.driverId = st.driverId
LEFT JOIN sprint_wins sw      ON sw.driverId = st.driverId
ORDER BY wins DESC, podiums DESC, poles DESC, COALESCE(sw.sprintWins, 0) DESC
LIMIT 5
`,
  constructors: `
WITH starts AS (
  SELECT res.constructorId, COUNT(DISTINCT res.raceId) AS starts
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id
  GROUP BY res.constructorId
),
wins AS (
  SELECT res.constructorId, COUNT(*) AS wins
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.position = 1
  GROUP BY res.constructorId
),
podiums AS (
  SELECT res.constructorId, COUNT(*) AS podiums
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.position BETWEEN 1 AND 3
  GROUP BY res.constructorId
),
poles AS (
  SELECT q.constructorId, COUNT(*) AS poles
  FROM ${fq("qualifying")} q
  JOIN ${fq("races")} r ON r.raceId = q.raceId
  WHERE r.circuitId = @id AND q.position = 1
  GROUP BY q.constructorId
),
sprint_starts AS (
  SELECT sr.constructorId, COUNT(DISTINCT sr.raceId) AS sprintStarts
  FROM ${fq("sprint_results")} sr
  JOIN ${fq("races")} r ON r.raceId = sr.raceId
  WHERE r.circuitId = @id
  GROUP BY sr.constructorId
),
sprint_wins AS (
  SELECT sr.constructorId, COUNT(*) AS sprintWins
  FROM ${fq("sprint_results")} sr
  JOIN ${fq("races")} r ON r.raceId = sr.raceId
  WHERE r.circuitId = @id AND sr.positionOrder = 1
  GROUP BY sr.constructorId
)
-- Constructors have no 3-letter "code" field; the client derives a short tag
-- from the name the same way the logo route's monogramFor() does.
SELECT
  c.constructorId    AS id,
  c.constructorRef   AS code,
  c.name             AS name,
  st.starts          AS starts,
  COALESCE(w.wins, 0)    AS wins,
  COALESCE(p.podiums, 0) AS podiums,
  COALESCE(pl.poles, 0)  AS poles,
  sprst.sprintStarts     AS sprintStarts,
  sw.sprintWins          AS sprintWins
FROM starts st
JOIN ${fq("constructors")} c ON c.constructorId = st.constructorId
LEFT JOIN wins w              ON w.constructorId = st.constructorId
LEFT JOIN podiums p           ON p.constructorId = st.constructorId
LEFT JOIN poles pl            ON pl.constructorId = st.constructorId
LEFT JOIN sprint_starts sprst ON sprst.constructorId = st.constructorId
LEFT JOIN sprint_wins sw      ON sw.constructorId = st.constructorId
ORDER BY wins DESC, podiums DESC, poles DESC, COALESCE(sw.sprintWins, 0) DESC
LIMIT 5
`,
};

// Breakdown queries: one row per (event, kind). For driver mode the grouping
// partner is the constructor; for constructor mode it's the driver. Four
// UNION branches — win / podium / pole / sprint win — each tagged with
// `kind` so the client can render "Win: 2019, 2022" as its own line rather
// than folding everything into one count.
const BREAKDOWN_SQL: Record<Mode, string> = {
  drivers: `
SELECT res.driverId AS entityId, c.constructorRef AS partnerKey,
       c.name AS partnerName, 'win' AS kind, r.year
FROM ${fq("results")} res
JOIN ${fq("races")} r ON r.raceId = res.raceId
JOIN ${fq("constructors")} c ON c.constructorId = res.constructorId
WHERE r.circuitId = @id AND res.position = 1 AND res.driverId IN UNNEST(@ids)

UNION ALL

SELECT res.driverId, c.constructorRef, c.name, 'podium', r.year
FROM ${fq("results")} res
JOIN ${fq("races")} r ON r.raceId = res.raceId
JOIN ${fq("constructors")} c ON c.constructorId = res.constructorId
WHERE r.circuitId = @id AND res.position BETWEEN 1 AND 3
  AND res.driverId IN UNNEST(@ids)

UNION ALL

SELECT q.driverId, c.constructorRef, c.name, 'pole', r.year
FROM ${fq("qualifying")} q
JOIN ${fq("races")} r ON r.raceId = q.raceId
JOIN ${fq("constructors")} c ON c.constructorId = q.constructorId
WHERE r.circuitId = @id AND q.position = 1 AND q.driverId IN UNNEST(@ids)

UNION ALL

SELECT sr.driverId, c.constructorRef, c.name, 'sprint', r.year
FROM ${fq("sprint_results")} sr
JOIN ${fq("races")} r ON r.raceId = sr.raceId
JOIN ${fq("constructors")} c ON c.constructorId = sr.constructorId
WHERE r.circuitId = @id AND sr.positionOrder = 1 AND sr.driverId IN UNNEST(@ids)

ORDER BY entityId, partnerName, year
`,
  constructors: `
SELECT res.constructorId AS entityId, CAST(res.driverId AS STRING) AS partnerKey,
       CONCAT(d.forename, ' ', d.surname) AS partnerName, 'win' AS kind, r.year
FROM ${fq("results")} res
JOIN ${fq("races")} r ON r.raceId = res.raceId
JOIN ${fq("drivers")} d ON d.driverId = res.driverId
WHERE r.circuitId = @id AND res.position = 1 AND res.constructorId IN UNNEST(@ids)

UNION ALL

SELECT res.constructorId, CAST(res.driverId AS STRING), CONCAT(d.forename, ' ', d.surname), 'podium', r.year
FROM ${fq("results")} res
JOIN ${fq("races")} r ON r.raceId = res.raceId
JOIN ${fq("drivers")} d ON d.driverId = res.driverId
WHERE r.circuitId = @id AND res.position BETWEEN 1 AND 3
  AND res.constructorId IN UNNEST(@ids)

UNION ALL

SELECT q.constructorId, CAST(q.driverId AS STRING), CONCAT(d.forename, ' ', d.surname), 'pole', r.year
FROM ${fq("qualifying")} q
JOIN ${fq("races")} r ON r.raceId = q.raceId
JOIN ${fq("drivers")} d ON d.driverId = q.driverId
WHERE r.circuitId = @id AND q.position = 1 AND q.constructorId IN UNNEST(@ids)

UNION ALL

SELECT sr.constructorId, CAST(sr.driverId AS STRING), CONCAT(d.forename, ' ', d.surname), 'sprint', r.year
FROM ${fq("sprint_results")} sr
JOIN ${fq("races")} r ON r.raceId = sr.raceId
JOIN ${fq("drivers")} d ON d.driverId = sr.driverId
WHERE r.circuitId = @id AND sr.positionOrder = 1 AND sr.constructorId IN UNNEST(@ids)

ORDER BY entityId, partnerName, year
`,
};

type EntityRow = {
  id: number;
  code: string | null;
  name: string;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintStarts: number | null;
  sprintWins: number | null;
};

type BreakdownRow = {
  entityId: number;
  partnerKey: string;
  partnerName: string;
  kind: "win" | "podium" | "pole" | "sprint";
  year: number;
};

type PartnerBreakdown = {
  partnerKey: string;
  partnerName: string;
  wins: number[];
  podiums: number[];
  poles: number[];
  sprintWins: number[];
};

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

function pushYear(arr: number[], year: number) {
  if (!arr.includes(year)) arr.push(year);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("id");
  const id = Number(raw);
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode: Mode = modeParam === "constructors" ? "constructors" : "drivers";

  if (!raw || !Number.isInteger(id)) {
    return NextResponse.json(
      { error: "Query param `id` must be an integer circuitId" },
      { status: 400 }
    );
  }

  try {
    const rows = await query<EntityRow>(TOP_ENTITY_SQL[mode], { id });

    const entities = rows.map((r) => {
      const hadSprint = (r.sprintStarts ?? 0) > 0;
      return {
        id: r.id,
        code: r.code ?? r.name.slice(0, 3).toUpperCase(),
        name: r.name,
        starts: r.starts,
        wins: r.wins,
        winPct: pct(r.wins, r.starts),
        podiums: r.podiums,
        podiumPct: pct(r.podiums, r.starts),
        poles: r.poles,
        sprintWins: hadSprint ? r.sprintWins ?? 0 : null,
        sprintWinPct: hadSprint ? pct(r.sprintWins ?? 0, r.sprintStarts!) : null,
        breakdown: [] as PartnerBreakdown[],
      };
    });

    if (entities.length > 0) {
      const ids = entities.map((e) => e.id);
      const rows2 = await query<BreakdownRow>(BREAKDOWN_SQL[mode], { id, ids });

      const byEntity = new Map<number, Map<string, PartnerBreakdown>>();

      for (const row of rows2) {
        if (!byEntity.has(row.entityId)) byEntity.set(row.entityId, new Map());
        const partners = byEntity.get(row.entityId)!;
        if (!partners.has(row.partnerKey)) {
          partners.set(row.partnerKey, {
            partnerKey: row.partnerKey,
            partnerName: row.partnerName,
            wins: [],
            podiums: [],
            poles: [],
            sprintWins: [],
          });
        }
        const p = partners.get(row.partnerKey)!;
        if (row.kind === "win") pushYear(p.wins, row.year);
        if (row.kind === "podium") pushYear(p.podiums, row.year);
        if (row.kind === "pole") pushYear(p.poles, row.year);
        if (row.kind === "sprint") pushYear(p.sprintWins, row.year);
      }

      for (const e of entities) {
        const partners = byEntity.get(e.id);
        if (!partners) continue;
        e.breakdown = Array.from(partners.values())
          .map((p) => ({
            ...p,
            wins: p.wins.sort((a, b) => a - b),
            podiums: p.podiums.sort((a, b) => a - b),
            poles: p.poles.sort((a, b) => a - b),
            sprintWins: p.sprintWins.sort((a, b) => a - b),
          }))
          .sort((a, b) => b.wins.length - a.wins.length || b.podiums.length - a.podiums.length);
      }
    }

    return NextResponse.json(
      { mode, entities },
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
    console.error("[/api/circuit-top-entities]", err);
    return NextResponse.json(
      { error: "Failed to load top entities" },
      { status: 500 }
    );
  }
}
