import { fq } from "@/lib/bigquery";

// Single source of truth for the Circuit Mastery metric.
//
// Both the dashboard route (app/api/circuit-mastery/route.ts) and the AI chat
// tool (lib/ai/tools.ts) import this, so the number the chat quotes and the
// number the dashboard renders are guaranteed identical — they run the exact
// same query. Do not inline-copy this SQL anywhere; import it.
//
// mastery = 0.6 * efficiency + 0.4 * dominance
//   efficiency: scored vs. max available, Bayesian-smoothed (C imaginary
//     weekends) toward the driver's own average so small samples don't spike.
//   dominance:  absolute (wins + podiums + poles) vs. the driver's best circuit.
// Max-available adapts per weekend (Variant B): pole/FL/sprint only count
// toward the denominator when that data actually exists, so pre-1994 (no
// qualifying data) and pre-2021 (no sprints) eras aren't penalised.
//
// NOTE: the sprint branch is NOT optional even for circuits without sprints —
// sprint weekends elsewhere shift avg_rate and the smoothing denominator,
// which nudges every circuit's score. Dropping it silently changes results.

export const MASTERY_C = 5; // Bayesian smoothing strength (imaginary weekends)
export const MASTERY_W_EFF = 0.6;
export const MASTERY_W_DOM = 0.4;

export const MASTERY_SQL = `
WITH weekend AS (
  SELECT
    r.circuitId,
    CASE res.positionOrder
      WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 WHEN 4 THEN 4 WHEN 5 THEN 3
      WHEN 6 THEN 2 WHEN 7 THEN 2 WHEN 8 THEN 1 WHEN 9 THEN 1 WHEN 10 THEN 1
      ELSE 0 END
    * CASE WHEN (st.status = 'Finished' OR st.status LIKE '%Lap%') THEN 1 ELSE 0 END
    AS race_pts,
    CASE WHEN res.grid = 1 THEN 5 ELSE 0 END AS pole_pts,
    CASE WHEN res.rank = 1 THEN 1 ELSE 0 END AS fl_pts,
    10 AS max_race, 5 AS max_pole,
    CASE WHEN res.rank IS NOT NULL THEN 1 ELSE 0 END AS max_fl,
    CASE WHEN res.positionOrder = 1 AND (st.status='Finished' OR st.status LIKE '%Lap%') THEN 1 ELSE 0 END AS is_win,
    CASE WHEN res.positionOrder <= 3 AND (st.status='Finished' OR st.status LIKE '%Lap%') THEN 1 ELSE 0 END AS is_podium,
    CASE WHEN res.grid = 1 THEN 1 ELSE 0 END AS is_pole
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  JOIN ${fq("status")} st ON res.statusId = st.statusId
  WHERE res.driverId = @id
),
sprint AS (
  SELECT r.circuitId,
    CASE sp.positionOrder WHEN 1 THEN 3 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 0 END AS sprint_pts,
    3 AS max_sprint,
    CASE WHEN sp.positionOrder = 1 THEN 1 ELSE 0 END AS sp_win,
    CASE WHEN sp.positionOrder <= 3 THEN 1 ELSE 0 END AS sp_podium,
    CASE WHEN sp.grid = 1 THEN 1 ELSE 0 END AS sp_pole
  FROM ${fq("sprint_results")} sp
  JOIN ${fq("races")} r ON sp.raceId = r.raceId
  WHERE sp.driverId = @id
),
per_circuit AS (
  SELECT w.circuitId,
    COUNT(*) AS starts,
    SUM(w.race_pts + w.pole_pts + w.fl_pts) AS scored,
    SUM(w.max_race + w.max_pole + w.max_fl) AS max_possible,
    SUM(w.is_win) AS wins,
    SUM(w.is_podium) AS podiums,
    SUM(w.is_pole) AS poles
  FROM weekend w GROUP BY w.circuitId
),
sprint_circuit AS (
  SELECT circuitId,
    SUM(sprint_pts) AS sprint_scored,
    SUM(max_sprint) AS sprint_max,
    SUM(sp_win) AS sprint_wins,
    SUM(sp_podium) AS sprint_podiums,
    SUM(sp_pole) AS sprint_poles,
    COUNT(*) AS sprint_count
  FROM sprint GROUP BY circuitId
),
combined AS (
  SELECT pc.circuitId, pc.starts, pc.wins, pc.podiums, pc.poles,
    pc.scored + COALESCE(sc.sprint_scored, 0) AS scored,
    pc.max_possible + COALESCE(sc.sprint_max, 0) AS max_possible,
    (pc.wins + pc.podiums + pc.poles) AS dom_raw,
    COALESCE(sc.sprint_wins, 0) AS sprint_wins,
    COALESCE(sc.sprint_podiums, 0) AS sprint_podiums,
    COALESCE(sc.sprint_poles, 0) AS sprint_poles,
    COALESCE(sc.sprint_count, 0) AS sprint_count
  FROM per_circuit pc
  LEFT JOIN sprint_circuit sc ON pc.circuitId = sc.circuitId
),
agg AS (
  SELECT
    SUM(scored) / NULLIF(SUM(max_possible), 0) AS avg_rate,
    MAX(dom_raw) AS max_dom
  FROM combined
),
flat AS (
  SELECT
    c.circuitId, c.starts, c.wins, c.podiums, c.poles,
    c.sprint_wins, c.sprint_podiums, c.sprint_poles, c.sprint_count,
    c.dom_raw, c.scored, c.max_possible,
    CAST(c.max_possible AS FLOAT64) / c.starts AS avg_weekend_max,
    a.avg_rate, a.max_dom
  FROM combined c
  CROSS JOIN agg a
),
scored_final AS (
  SELECT
    circuitId, starts, wins, podiums, poles,
    sprint_wins, sprint_podiums, sprint_poles, sprint_count,
    100 * (scored + avg_rate * avg_weekend_max * ${MASTERY_C})
        / (max_possible + avg_weekend_max * ${MASTERY_C}) AS efficiency,
    100 * dom_raw / NULLIF(max_dom, 0) AS dominance
  FROM flat
)
SELECT
  ci.name AS circuit,
  ci.country,
  f.starts,
  f.wins, f.podiums, f.poles,
  f.sprint_wins, f.sprint_podiums, f.sprint_poles, f.sprint_count,
  ROUND(${MASTERY_W_EFF} * f.efficiency + ${MASTERY_W_DOM} * f.dominance, 1) AS mastery
FROM scored_final f
JOIN ${fq("circuits")} ci ON f.circuitId = ci.circuitId
ORDER BY mastery DESC
LIMIT 5
`;
