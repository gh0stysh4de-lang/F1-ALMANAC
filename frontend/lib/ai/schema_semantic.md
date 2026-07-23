# F1 Database — Semantic Schema (for SQL generation)

BigQuery Standard SQL. Project/dataset prefix for every table:
`f1-encyclopedia-498914.f1.<table>`

Rules that override intuition:
- Read-only. Only `SELECT`. Never DDL/DML.
- Always add `LIMIT` (<= 100 unless the user asks for a full ranking).
- Use `SAFE_CAST` when converting strings to numbers.
- Prefer explicit `JOIN ... ON`. Never cross join large tables.
- When unsure whether data exists for an era, check "Data coverage" below and
  tell the user plainly instead of returning an empty result as if it were an answer.

---

## The single most important disambiguation: finishing position

`results` has THREE position columns. Choosing wrong gives silently wrong numbers.

- `positionOrder` (INT64, ALWAYS populated) — the classified finishing order,
  including retirements ranked at the back. **Use this for every finishing-position
  comparison, win/podium count, and teammate ordering.**
- `position` (INT64, NULLABLE) — only set when classified in a scoring-style sense;
  NULL for DNF. **Do NOT use for counts or comparisons** — NULLs will drop rows.
- `positionText` (STRING) — display value: "1".."20", "R" (retired), "D"
  (disqualified), "W" (withdrawn), "N" (not classified). Use only when you need to
  detect retirement/DQ explicitly.

Win = `positionOrder = 1` AND finished.
Podium = `positionOrder <= 3` AND finished.
"Finished" = joined `status.status = 'Finished' OR status LIKE '%Lap%'`.
Pole = `grid = 1` (in `results`; reliable across all eras, unlike `qualifying`).
Fastest lap = `results.rank = 1` (NULLABLE; only modern era).

Note `grid = 0` means started from pit lane — NOT pole.

---

## Tables

### drivers (865) — one row per driver, all history
`driverId` PK · `driverRef` (e.g. "hamilton") · `code` (3-letter, NULLABLE for
older drivers) · `number` (NULLABLE) · `forename` · `surname` · `dob`
(STRING 'YYYY-MM-DD') · `nationality` · `url`
- Full name: `forename || ' ' || surname`.
- Match a driver by name: `LOWER(surname) = LOWER(@name)` first; fall back to
  `driverRef`. Surnames are not unique (e.g. multiple "Schumacher", "Verstappen",
  "Hill", "Rosberg") — if ambiguous, return all matches and their years active.

### constructors (214) — teams, all history
`constructorId` PK · `constructorRef` (e.g. "mclaren") · `name` (e.g. "McLaren")
· `nationality` · `url`

### circuits (78)
`circuitId` PK · `circuitRef` · `name` · `location` (city) · `country` · `lat` ·
`lng` · `alt` (NULLABLE) · `url`
- Group "a circuit" by `circuitId`. The same venue can host GPs under different
  race names across years (e.g. Imola).

### seasons (77)
`year` PK · `url`

### season_descriptions (77)
`season` (FK year) · `title` · `description` — curated prose; use for narrative
questions about a season.

### races (1171) — every Grand Prix
`raceId` PK · `year` (FK) · `round` · `circuitId` (FK) · `name` (e.g. "Monaco
Grand Prix") · `date` ('YYYY-MM-DD') · `time` (NULLABLE) · session date/time
columns `fp1_*`..`sprint_*` (NULLABLE) · `url`

### status (140) — finish-status lookup
`statusId` PK · `status` (STRING: "Finished", "+1 Lap", "Engine", "Collision"…)
- Classified finish: `status = 'Finished' OR status LIKE '%Lap%'`. Everything
  else is a DNF (mechanical, accident, etc.).

### results (27370) — main race results, the central table
`resultId` PK · `raceId` · `driverId` · `constructorId` · `number` (NULLABLE) ·
`grid` · `position` (NULLABLE) · `positionText` · `positionOrder` · `points`
(FLOAT64) · `laps` · `time` (NULLABLE) · `milliseconds` (NULLABLE) · `fastestLap`
(NULLABLE) · `rank` (fastest-lap rank, NULLABLE) · `fastestLapTime` (NULLABLE) ·
`fastestLapSpeed` (NULLABLE) · `statusId` (FK)
- `points` here are RACE points only. Sprint points are NOT included (see standings).

### qualifying (11102) — grid qualifying sessions, 1994+
`qualifyId` PK · `raceId` · `driverId` · `constructorId` · `number` · `position`
(grid-qualifying position) · `q1` · `q2` · `q3` (lap-time STRINGs, NULLABLE)
- Starts 1994. For pole across ALL eras use `results.grid = 1` instead.

### sprint_results (546) — sprint races, 2021+
Same shape as `results` (`grid`, `position` NULLABLE, `positionOrder`, `points`,
`statusId`, `rank`…). Points here are sprint points.

### driver_standings (35493) — standings AFTER EACH round (not just final)
`driverStandingsId` PK · `raceId` · `driverId` · `points` (cumulative, INCLUDES
sprint points) · `position` · `positionText` · `wins`
- Final standing of a season: the row where `round` = the season's max round.
- Trajectory over a season: all rounds.
- Pre-1991 "dropped scores": `standings.points` can be LESS than
  `SUM(results.points)` — the championship counted only best N results.

### constructor_standings (13697) — same idea, per team
`constructorStandingsId` PK · `raceId` · `constructorId` · `points` · `position`
· `positionText` · `wins`

### constructor_results (12931) — team points per race
`constructorResultsId` PK · `raceId` · `constructorId` · `points` · `status`
(NULLABLE)

### lap_times (872521) — per-lap timing. Data from 1996.
`raceId` · `driverId` · `lap` · `position` · `time` ('1:32.456') ·
`milliseconds`. No PK; key is (raceId, driverId, lap).

### pit_stops (22335) — data from 2011.
`raceId` · `driverId` · `stop` · `lap` · `time` (time of day) · `duration`
(STRING; usually seconds "23.456", sometimes "mm:ss.sss" for red-flag stops) ·
`milliseconds` (NULLABLE, unreliable for long stops)
- Always `SAFE_CAST(duration AS FLOAT64)`; it will be NULL for "mm:ss.sss" — filter those out.

---

## Recipes (copy these patterns)

Career wins for a driver:
```sql
SELECT COUNT(*) AS wins
FROM `f1-encyclopedia-498914.f1.results` res
JOIN `f1-encyclopedia-498914.f1.status` st ON res.statusId = st.statusId
JOIN `f1-encyclopedia-498914.f1.drivers` d ON res.driverId = d.driverId
WHERE LOWER(d.surname) = 'hamilton'
  AND res.positionOrder = 1
  AND (st.status = 'Finished' OR st.status LIKE '%Lap%')
```

Podiums / poles: same shape, swap the predicate
(`positionOrder <= 3` / `res.grid = 1`).

Championships won by a driver (count seasons finished P1):
```sql
WITH final AS (
  SELECT r.year, ds.driverId,
    ROW_NUMBER() OVER (PARTITION BY r.year ORDER BY r.round DESC) AS rn,
    ds.position
  FROM `f1-encyclopedia-498914.f1.driver_standings` ds
  JOIN `f1-encyclopedia-498914.f1.races` r ON ds.raceId = r.raceId
)
SELECT COUNT(*) AS titles
FROM final f
JOIN `f1-encyclopedia-498914.f1.drivers` d ON f.driverId = d.driverId
WHERE f.rn = 1 AND f.position = 1 AND LOWER(d.surname) = 'hamilton'
```

Age at a race:
```sql
DATE_DIFF(DATE(r.date), DATE(d.dob), YEAR) AS age_years
```

Most DNFs / retirements:
```sql
... JOIN status st ... WHERE st.status != 'Finished' AND st.status NOT LIKE '%Lap%'
```

---

## Data coverage (state this honestly when asked outside range)

- Race results, grid, points, championships: 1950–present.
- Qualifying sessions table: 1994+ (use `results.grid` for pole in any era).
- Fastest-lap rank: modern era only (`results.rank` often NULL before ~2004).
- Lap times: 1996+.
- Pit stops: 2011+.
- Sprint races: 2021+.

## NOT in the database (say so; never invent columns)
Weather / rain, tyre compounds, driver salaries, team budgets, radio messages,
detailed crash/incident causes beyond the `status` label, DRS/ERS telemetry,
race stewards' decisions, contract details.
