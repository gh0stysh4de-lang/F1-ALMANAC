// smoke.mjs — разова перевірка зʼєднання. Запуск: node smoke.mjs
// (видали після перевірки)
import { BigQuery } from "@google-cloud/bigquery";

const bq = new BigQuery({ projectId: "f1-encyclopedia-498914" });
const [rows] = await bq.query({
  query: "SELECT COUNT(*) AS n FROM `f1-encyclopedia-498914.f1.results`",
  location: "EU",
});
console.log("OK, results rows:", rows[0].n);