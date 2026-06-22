import { NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

const SEASONS_SQL = `
SELECT year FROM ${fq("seasons")} ORDER BY year DESC
`;

export async function GET() {
  try {
    const rows = await query<{ year: number }>(SEASONS_SQL, {});
    const years = rows.map((r) => Number(r.year));
    return NextResponse.json(
      { years },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch (err) {
    console.error("[/api/seasons] query failed:", err);
    return NextResponse.json({ error: "Failed to load seasons." }, { status: 500 });
  }
}
