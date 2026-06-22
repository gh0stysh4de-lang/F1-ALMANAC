import { BigQuery } from "@google-cloud/bigquery";

/**
 * BigQuery client (singleton).
 *
 * Local dev (Windows / Cloud Shell): uses Application Default Credentials.
 *   Run `gcloud auth application-default login` once; the quota project must
 *   be set (`gcloud auth application-default set-quota-project f1-encyclopedia-498914`).
 *
 * Vercel / prod: set the GCP_SA_KEY env var to the FULL service-account JSON
 *   (one line, escaped). We parse it and pass credentials explicitly.
 */

const PROJECT_ID =
  process.env.GCP_PROJECT_ID ?? "f1-encyclopedia-498914";

let _client: BigQuery | null = null;

function makeClient(): BigQuery {
  const saKey = process.env.GCP_SA_KEY;

  if (saKey && saKey.trim().length > 0) {
    // Prod path: explicit credentials from JSON in env.
    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(saKey);
    } catch {
      throw new Error(
        "GCP_SA_KEY is set but is not valid JSON. Paste the full service-account key as a single-line JSON string."
      );
    }
    // Vercel often stores newlines as literal "\n" — restore them.
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return new BigQuery({ projectId: PROJECT_ID, credentials });
  }

  // Local path: Application Default Credentials (gcloud).
  return new BigQuery({ projectId: PROJECT_ID });
}

export function getBigQuery(): BigQuery {
  if (!_client) _client = makeClient();
  return _client;
}

/** Fully-qualified table name, e.g. fq("results") -> `f1-encyclopedia-498914.f1.results` */
export function fq(table: string): string {
  return `\`${PROJECT_ID}.f1.${table}\``;
}

/**
 * Run a parameterised query and return typed rows.
 * Always use named params (@season) — never string-interpolate user input.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const bq = getBigQuery();
  const [rows] = await bq.query({
    query: sql,
    params,
    location: process.env.BQ_LOCATION ?? "EU", // dataset f1 lives in the EU multi-region
  });
  return rows as T[];
}
