import type Anthropic from "@anthropic-ai/sdk";
import { getBigQuery, query, fq } from "@/lib/bigquery";
import { guardSql } from "@/lib/ai/sql-guard";
import { MASTERY_SQL } from "@/lib/ai/mastery-sql";

/**
 * Tools for the AI Data Chat (`/api/ask`).
 *
 * Two kinds, per the hybrid architecture in the hand-off doc:
 *   - Verified tools (find_driver, get_driver_summary, compare_teammates,
 *     circuit_mastery, season_standings) — hand-written SQL copied from the
 *     already-shipped, already-checked API routes. These may safely touch
 *     tables outside sql-guard's allow-list (e.g. driver_descriptions),
 *     because the SQL is ours, not model-generated.
 *   - run_sql — the text-to-SQL fallback for anything not covered above.
 *     ALWAYS goes through guardSql() (static checks + BigQuery dry run)
 *     before it is allowed to execute. This is the only tool that runs
 *     arbitrary, model-written SQL.
 */

const MAX_BYTES_BILLED = 2 * 1024 * 1024 * 1024; // 2 GB, matches sql-guard
const MAX_SQL_ROWS = 100;
const BQ_LOCATION = process.env.BQ_LOCATION ?? "EU";

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return Number((v as { value: unknown }).value);
  }
  return Number(v);
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
}

// ---------------------------------------------------------------------------
// Tool schemas (Anthropic Messages API `tools` format)
// ---------------------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_driver",
    description:
      "Look up driver(s) by name to resolve a driverId. F1 has many drivers " +
      "sharing a surname (Schumacher, Verstappen, Hill, Rosberg...) — this " +
      "always returns every match with the years they were active, so you " +
      "can disambiguate before calling other driver tools. ALWAYS call this " +
      "first for any question about a named driver; never guess a driverId.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Full or partial driver name, e.g. 'Hamilton' or 'Max Verstappen'.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_driver_summary",
    description:
      "Career totals for one driver: titles, wins, podiums, poles, starts, " +
      "points, plus a short curated career description. Use after " +
      "find_driver has resolved a driverId.",
    input_schema: {
      type: "object",
      properties: {
        driverId: { type: "integer", description: "driverId from find_driver." },
      },
      required: ["driverId"],
    },
  },
  {
    name: "compare_teammates",
    description:
      "Season-by-season teammate head-to-head for a driver: race finishes " +
      "and qualifying, against all teammates that year combined. Use for " +
      "'how did X compare to their teammates' style questions.",
    input_schema: {
      type: "object",
      properties: {
        driverId: { type: "integer", description: "driverId from find_driver." },
      },
      required: ["driverId"],
    },
  },
  {
    name: "circuit_mastery",
    description:
      "A driver's top 5 circuits by a composite 'mastery' score blending " +
      "scoring efficiency and dominance (wins/podiums/poles). Use for " +
      "'best track' / 'strongest circuit' style questions. This is a " +
      "deliberately curated metric — do not try to recompute it with run_sql.",
    input_schema: {
      type: "object",
      properties: {
        driverId: { type: "integer", description: "driverId from find_driver." },
      },
      required: ["driverId"],
    },
  },
  {
    name: "season_standings",
    description:
      "Final championship standings (top 10) for a given season, drivers or " +
      "constructors.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Season year, e.g. 2023." },
        type: {
          type: "string",
          enum: ["drivers", "constructors"],
          description: "Which standings to return.",
        },
      },
      required: ["year", "type"],
    },
  },
  {
    name: "run_sql",
    description:
      "Fallback for any question the other tools don't cover: run a " +
      "read-only BigQuery Standard SQL SELECT against the F1 dataset " +
      "described in your system prompt. The query is statically validated " +
      "and dry-run against BigQuery before it is ever executed — if it is " +
      "rejected, you will get the exact error back and may try again with a " +
      "corrected query (you have a limited number of attempts). Always " +
      "include a LIMIT. Use fully-qualified backtick table names exactly as " +
      "shown in the schema.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A single read-only SELECT/WITH statement." },
        purpose: {
          type: "string",
          description: "One short sentence: what this query is trying to answer.",
        },
      },
      required: ["sql", "purpose"],
    },
  },
];

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export type ToolLogEntry = {
  tool: string;
  input: unknown;
  ok: boolean;
  summary: string;
  sql?: string;
  bytesProcessed?: number;
};

async function findDriver(name: string) {
  const pattern = `%${name.trim()}%`;
  const rows = await query<{
    driverId: number;
    forename: unknown;
    surname: unknown;
    code: unknown;
    nationality: unknown;
    first_year: number;
    last_year: number;
  }>(
    `
    SELECT d.driverId, d.forename, d.surname, d.code, d.nationality,
      MIN(r.year) AS first_year, MAX(r.year) AS last_year
    FROM ${fq("drivers")} d
    JOIN ${fq("results")} res ON res.driverId = d.driverId
    JOIN ${fq("races")} r ON r.raceId = res.raceId
    WHERE LOWER(d.surname) LIKE LOWER(@pattern)
       OR LOWER(CONCAT(d.forename, ' ', d.surname)) LIKE LOWER(@pattern)
    GROUP BY d.driverId, d.forename, d.surname, d.code, d.nationality
    ORDER BY last_year DESC
    LIMIT 10
    `,
    { pattern }
  );

  return rows.map((r) => ({
    driverId: r.driverId,
    name: `${clean(r.forename) ?? ""} ${clean(r.surname) ?? ""}`.trim(),
    code: clean(r.code),
    nationality: clean(r.nationality),
    active: `${r.first_year}-${r.last_year}`,
  }));
}

async function getDriverSummary(driverId: number) {
  const rows = await query<Record<string, unknown>>(
    `
    WITH race AS (
      SELECT res.driverId,
        COUNTIF(res.positionOrder = 1 AND (st.status='Finished' OR st.status LIKE '%Lap%')) AS wins,
        COUNTIF(res.positionOrder <= 3 AND (st.status='Finished' OR st.status LIKE '%Lap%')) AS podiums,
        COUNTIF(res.grid = 1) AS poles,
        COUNT(*) AS starts,
        SUM(res.points) AS race_points
      FROM ${fq("results")} res
      JOIN ${fq("status")} st ON res.statusId = st.statusId
      WHERE res.driverId = @id
      GROUP BY res.driverId
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
      WHERE ds.driverId = @id AND ds.position = 1
        AND r.round = (SELECT MAX(r2.round) FROM ${fq("races")} r2 WHERE r2.year = r.year)
      GROUP BY ds.driverId
    )
    SELECT d.forename, d.surname, d.code, d.nationality, d.dob,
      desc_t.description AS description,
      COALESCE(titles.titles, 0) AS titles,
      COALESCE(race.wins, 0) AS wins,
      COALESCE(race.podiums, 0) AS podiums,
      COALESCE(race.poles, 0) AS poles,
      COALESCE(race.starts, 0) AS starts,
      COALESCE(race.race_points, 0) + COALESCE(sprint.sprint_points, 0) AS points
    FROM ${fq("drivers")} d
    LEFT JOIN race ON d.driverId = race.driverId
    LEFT JOIN sprint ON d.driverId = sprint.driverId
    LEFT JOIN titles ON d.driverId = titles.driverId
    -- driver_descriptions is outside sql-guard's allow-list on purpose: this
    -- is our own hand-written query, not model-generated SQL, so that's fine.
    LEFT JOIN ${fq("driver_descriptions")} desc_t ON d.driverId = desc_t.driverId
    WHERE d.driverId = @id
    LIMIT 1
    `,
    { id: driverId }
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    name: `${clean(r.forename) ?? ""} ${clean(r.surname) ?? ""}`.trim(),
    code: clean(r.code),
    nationality: clean(r.nationality),
    dob: clean(r.dob),
    description: clean(r.description),
    titles: num(r.titles),
    wins: num(r.wins),
    podiums: num(r.podiums),
    poles: num(r.poles),
    starts: num(r.starts),
    points: num(r.points),
  };
}

async function compareTeammates(driverId: number) {
  const rows = await query<Record<string, unknown>>(
    `
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
      SELECT dr.year, c.name AS team,
        ROW_NUMBER() OVER (PARTITION BY dr.year ORDER BY COUNT(*) DESC) AS rn
      FROM driver_races dr
      JOIN ${fq("constructors")} c ON dr.constructorId = c.constructorId
      GROUP BY dr.year, c.name
    )
    SELECT rh.year, rh.r_driver, rh.r_tm,
      COALESCE(qh.q_driver, 0) AS q_driver, COALESCE(qh.q_tm, 0) AS q_tm,
      tby.team
    FROM race_h2h rh
    LEFT JOIN quali_h2h qh ON rh.year = qh.year
    JOIN team_by_year tby ON rh.year = tby.year AND tby.rn = 1
    ORDER BY rh.year
    `,
    { id: driverId }
  );

  const seasons = rows.map((r) => ({
    season: num(r.year),
    team: clean(r.team),
    race: { driver: num(r.r_driver), teammate: num(r.r_tm) },
    qualifying: { driver: num(r.q_driver), teammate: num(r.q_tm) },
  }));

  const career = seasons.reduce(
    (acc, s) => ({
      raceDriver: acc.raceDriver + s.race.driver,
      raceTeammate: acc.raceTeammate + s.race.teammate,
      qualiDriver: acc.qualiDriver + s.qualifying.driver,
      qualiTeammate: acc.qualiTeammate + s.qualifying.teammate,
    }),
    { raceDriver: 0, raceTeammate: 0, qualiDriver: 0, qualiTeammate: 0 }
  );

  return { seasons, career };
}

async function circuitMastery(driverId: number) {
  // Uses the shared canonical query (lib/ai/mastery-sql.ts), the exact same
  // SQL the dashboard route runs — so the chat can never quote a number that
  // disagrees with the Circuit Mastery panel.
  const rows = await query<Record<string, unknown>>(MASTERY_SQL, { id: driverId });

  return rows.map((r) => ({
    circuit: clean(r.circuit),
    country: clean(r.country),
    starts: num(r.starts),
    wins: num(r.wins),
    podiums: num(r.podiums),
    poles: num(r.poles),
    mastery: num(r.mastery),
  }));
}

async function seasonStandings(year: number, type: "drivers" | "constructors") {
  if (type === "drivers") {
    const rows = await query<Record<string, unknown>>(
      `
      SELECT ds.position, d.forename, d.surname, ds.points, ds.wins
      FROM ${fq("driver_standings")} ds
      JOIN ${fq("drivers")} d ON ds.driverId = d.driverId
      JOIN ${fq("races")} r ON ds.raceId = r.raceId
      WHERE r.year = @year
        AND r.round = (SELECT MAX(r2.round) FROM ${fq("races")} r2 WHERE r2.year = @year)
      ORDER BY ds.position
      LIMIT 10
      `,
      { year }
    );
    return rows.map((r) => ({
      position: num(r.position),
      name: `${clean(r.forename) ?? ""} ${clean(r.surname) ?? ""}`.trim(),
      points: num(r.points),
      wins: num(r.wins),
    }));
  }

  const rows = await query<Record<string, unknown>>(
    `
    SELECT cs.position, c.name, cs.points, cs.wins
    FROM ${fq("constructor_standings")} cs
    JOIN ${fq("constructors")} c ON cs.constructorId = c.constructorId
    JOIN ${fq("races")} r ON cs.raceId = r.raceId
    WHERE r.year = @year
      AND r.round = (SELECT MAX(r2.round) FROM ${fq("races")} r2 WHERE r2.year = @year)
    ORDER BY cs.position
    LIMIT 10
    `,
    { year }
  );
  return rows.map((r) => ({
    position: num(r.position),
    name: clean(r.name),
    points: num(r.points),
    wins: num(r.wins),
  }));
}

/** Model-generated SQL: guarded (static + dry run), then actually executed. */
async function runSql(sql: string): Promise<{
  ok: boolean;
  rows?: unknown[];
  truncated?: boolean;
  bytesProcessed?: number;
  error?: string;
}> {
  const guard = await guardSql(sql);
  if (!guard.ok) {
    return { ok: false, error: guard.reason };
  }

  try {
    const bq = getBigQuery();
    const [rows] = await bq.query({
      query: sql,
      location: BQ_LOCATION,
      maximumBytesBilled: String(MAX_BYTES_BILLED),
    });
    const truncated = rows.length > MAX_SQL_ROWS;
    return {
      ok: true,
      rows: truncated ? rows.slice(0, MAX_SQL_ROWS) : rows,
      truncated,
      bytesProcessed: guard.bytesProcessed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown query error.";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Dispatcher used by the /api/ask route
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ resultForModel: unknown; logEntry: ToolLogEntry }> {
  try {
    switch (name) {
      case "find_driver": {
        const matches = await findDriver(String(input.name ?? ""));
        return {
          resultForModel: { matches },
          logEntry: {
            tool: name,
            input,
            ok: true,
            summary: `${matches.length} driver match(es) for "${input.name}".`,
          },
        };
      }
      case "get_driver_summary": {
        const summary = await getDriverSummary(Number(input.driverId));
        return {
          resultForModel: summary ?? { error: "Driver not found." },
          logEntry: {
            tool: name,
            input,
            ok: !!summary,
            summary: summary ? `Loaded summary for ${summary.name}.` : "Driver not found.",
          },
        };
      }
      case "compare_teammates": {
        const battles = await compareTeammates(Number(input.driverId));
        return {
          resultForModel: battles,
          logEntry: {
            tool: name,
            input,
            ok: true,
            summary: `Loaded teammate H2H across ${battles.seasons.length} season(s).`,
          },
        };
      }
      case "circuit_mastery": {
        const circuits = await circuitMastery(Number(input.driverId));
        return {
          resultForModel: { circuits },
          logEntry: {
            tool: name,
            input,
            ok: true,
            summary: `Loaded top ${circuits.length} circuits.`,
          },
        };
      }
      case "season_standings": {
        const type = input.type === "constructors" ? "constructors" : "drivers";
        const standings = await seasonStandings(Number(input.year), type);
        return {
          resultForModel: { standings },
          logEntry: {
            tool: name,
            input,
            ok: true,
            summary: `Loaded ${input.year} ${type} standings (top ${standings.length}).`,
          },
        };
      }
      case "run_sql": {
        const sql = String(input.sql ?? "");
        const result = await runSql(sql);
        return {
          resultForModel: result.ok
            ? { rows: result.rows, truncated: result.truncated }
            : { error: result.error },
          logEntry: {
            tool: name,
            input,
            ok: result.ok,
            summary: result.ok
              ? `Query returned ${result.rows?.length ?? 0} row(s).`
              : `Query rejected: ${result.error}`,
            sql,
            bytesProcessed: result.bytesProcessed,
          },
        };
      }
      default:
        return {
          resultForModel: { error: `Unknown tool: ${name}` },
          logEntry: { tool: name, input, ok: false, summary: "Unknown tool." },
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown tool error.";
    return {
      resultForModel: { error: message },
      logEntry: { tool: name, input, ok: false, summary: `Tool failed: ${message}` },
    };
  }
}
