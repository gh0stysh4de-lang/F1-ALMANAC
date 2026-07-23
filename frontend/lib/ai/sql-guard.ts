import { getBigQuery } from "@/lib/bigquery";

/**
 * SQL safety layer for AI-generated queries.
 *
 * Two independent gates:
 *   1. validateSql()  — cheap static checks. Reject anything that isn't a single
 *      read-only SELECT, references unknown tables, or looks mutating.
 *   2. dryRunSql()    — asks BigQuery to plan (not execute) the query. Catches
 *      hallucinated columns, type errors, and reports bytes scanned. Free and fast.
 *
 * Only queries that pass BOTH are ever executed.
 */

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "f1-encyclopedia-498914";

// The only tables the assistant may read.
const ALLOWED_TABLES = new Set([
  "seasons",
  "season_descriptions",
  "circuits",
  "constructors",
  "drivers",
  "races",
  "status",
  "results",
  "qualifying",
  "sprint_results",
  "driver_standings",
  "constructor_standings",
  "constructor_results",
  "lap_times",
  "pit_stops",
]);

// Statements / keywords that must never appear (mutation, DDL, multi-statement).
const FORBIDDEN = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bMERGE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCALL\b/i,
  /\bEXPORT\b/i,
  /\bLOAD\b/i,
  // NB: no /\bINTO\b/ — BigQuery has no `SELECT ... INTO` write path (writes
  // go through EXPORT DATA / CREATE TABLE AS, both already blocked above), so
  // matching INTO only rejected valid queries that happened to contain it.
  /\bBEGIN\b/i,
  /\bDECLARE\b/i, // scripting; our generated queries are single statements
];

// Upper bound on data a single question may scan (guards against runaway cost).
const MAX_BYTES_BILLED = 2 * 1024 * 1024 * 1024; // 2 GB

export type GuardResult =
  | { ok: true; bytesProcessed: number }
  | { ok: false; reason: string };

/** Strip comments and string literals so keyword checks can't be smuggled past.
 *  Backtick identifiers are KEPT — we validate table names against them. */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/'(?:[^'\\]|\\.)*'/g, "''"); // single-quoted strings
}

/** Static, no-network validation. Returns null if OK, or a reason string. */
export function validateSql(rawSql: string): string | null {
  const sql = rawSql.trim();

  if (!sql) return "Empty query.";

  // Scrub comments and string literals FIRST, so that a semicolon (or a
  // forbidden keyword) sitting inside a string literal or comment can't
  // trigger a false rejection of an otherwise-valid query — e.g.
  // WHERE surname = 'a;b', or a trailing "-- note; delete later" comment.
  const scrubbedFull = stripCommentsAndStrings(sql);

  // Exactly one statement. Allow a single optional trailing semicolon.
  const withoutTrailing = scrubbedFull.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return "Only a single statement is allowed.";
  }

  const scrubbed = withoutTrailing;

  // Must start with SELECT or WITH (CTE).
  if (!/^\s*(SELECT|WITH)\b/i.test(scrubbed)) {
    return "Only SELECT queries are allowed.";
  }

  for (const pattern of FORBIDDEN) {
    if (pattern.test(scrubbed)) {
      return `Query contains a forbidden keyword: ${pattern.source}.`;
    }
  }

  // Every fully-qualified table reference must be in the allow-list and in our dataset.
  // Matches `project.f1.table` (with or without backticks).
  const tableRefs = [
    ...scrubbed.matchAll(
      /([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g
    ),
  ];
  for (const [, project, dataset, table] of tableRefs) {
    if (project !== PROJECT_ID || dataset !== "f1") {
      return `Query references a table outside the allowed dataset: ${project}.${dataset}.${table}.`;
    }
    if (!ALLOWED_TABLES.has(table)) {
      return `Query references an unknown table: ${table}.`;
    }
  }

  // A LIMIT is required to bound result size.
  if (!/\bLIMIT\s+\d+/i.test(scrubbed)) {
    return "Query must include a LIMIT clause.";
  }

  return null;
}

/**
 * Dry-run against BigQuery: validates columns/types and estimates scan size
 * WITHOUT executing. Cheap and free. Returns bytes it *would* process.
 */
export async function dryRunSql(sql: string): Promise<GuardResult> {
  const bq = getBigQuery();
  try {
    const [job] = await bq.createQueryJob({
      query: sql,
      location: process.env.BQ_LOCATION ?? "EU",
      dryRun: true,
      maximumBytesBilled: String(MAX_BYTES_BILLED),
    });

    const bytes = Number(
      job.metadata?.statistics?.totalBytesProcessed ?? 0
    );

    if (bytes > MAX_BYTES_BILLED) {
      return {
        ok: false,
        reason: `Query would scan ${(bytes / 1e9).toFixed(2)} GB, above the limit.`,
      };
    }

    return { ok: true, bytesProcessed: bytes };
  } catch (err) {
    // BigQuery returns precise errors here: unknown column, type mismatch, etc.
    const message =
      err instanceof Error ? err.message : "Unknown dry-run error.";
    return { ok: false, reason: message };
  }
}

/** Run both gates. Static first (free), then dry-run (network). */
export async function guardSql(sql: string): Promise<GuardResult> {
  const staticError = validateSql(sql);
  if (staticError) {
    return { ok: false, reason: staticError };
  }
  return dryRunSql(sql);
}
