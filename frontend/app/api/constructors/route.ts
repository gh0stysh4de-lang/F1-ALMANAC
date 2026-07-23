import { NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Full roster for the Constructors search box. Effectively static, so cache
// hard; filtering happens client-side over this small (~214 row) payload.
// Only teams that actually entered a race are listed (a handful of
// constructors in the table never started), and each carries its span of
// active years so the dropdown can disambiguate (e.g. the several "Lotus").
const CONSTRUCTORS_SQL = `
SELECT
  c.constructorId,
  c.constructorRef,
  c.name,
  c.nationality,
  MIN(r.year) AS first_year,
  MAX(r.year) AS last_year
FROM ${fq("constructors")} c
JOIN ${fq("results")} res ON res.constructorId = c.constructorId
JOIN ${fq("races")} r ON res.raceId = r.raceId
GROUP BY c.constructorId, c.constructorRef, c.name, c.nationality
ORDER BY c.name
`;

type ConstructorRaw = {
  constructorId: number;
  constructorRef: unknown;
  name: unknown;
  nationality: unknown;
  first_year: number | null;
  last_year: number | null;
};

type ConstructorListItem = {
  id: number;
  ref: string;
  name: string;
  nationality: string | null;
  years: string; // "1966–2026" or single "1975"
};

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
}

function formatYears(first: number | null, last: number | null): string {
  if (first === null && last === null) return "";
  if (first === last || last === null) return String(first);
  if (first === null) return String(last);
  return `${first}\u2013${last}`;
}

export async function GET() {
  try {
    const rows = await query<ConstructorRaw>(CONSTRUCTORS_SQL);

    const constructors: ConstructorListItem[] = rows.map((r) => ({
      id: Number(r.constructorId),
      ref: clean(r.constructorRef) ?? "",
      name: clean(r.name) ?? "",
      nationality: clean(r.nationality),
      years: formatYears(
        r.first_year === null ? null : Number(r.first_year),
        r.last_year === null ? null : Number(r.last_year)
      ),
    }));

    return NextResponse.json(
      { constructors },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    console.error("[/api/constructors] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load constructors.", constructors: [] },
      { status: 500 }
    );
  }
}
