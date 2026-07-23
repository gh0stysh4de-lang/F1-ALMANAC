import { NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Full roster for the Drivers search box. The list is effectively static
// (a new driver appears only when a rookie debuts), so we cache it hard.
// Filtering/search happens client-side over this small (~865 row) payload.
const DRIVERS_SQL = `
SELECT
  driverId,
  forename,
  surname,
  code,
  nationality
FROM ${fq("drivers")}
ORDER BY surname, forename
`;

type DriverRaw = {
  driverId: number;
  forename: unknown;
  surname: unknown;
  code: unknown;
  nationality: unknown;
};

type DriverListItem = {
  id: number;
  name: string;
  code: string; // always present: real code, or generated from surname
  nationality: string | null;
};

// Ergast CSV uses the literal "\N" as a NULL marker; coerce to string defensively.
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in v) {
    v = (v as { value: unknown }).value;
  }
  const t = String(v).trim();
  if (t === "" || t === "\\N") return null;
  return t;
}

// Generate a 3-letter code from a surname for drivers without an official one
// (mostly pre-2000 drivers). F1-style: strip diacritics, drop spaces/hyphens,
// take the first three letters uppercased. "de la Rosa" -> "DEL",
// "Räikkönen" -> "RAI". Falls back to the forename if a surname is missing.
function generateCode(forename: string | null, surname: string | null): string {
  const base = (surname && surname.length > 0 ? surname : forename) ?? "";
  const ascii = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .replace(/[^A-Za-z]/g, ""); // drop spaces, hyphens, apostrophes, etc.
  return ascii.slice(0, 3).toUpperCase();
}

export async function GET() {
  try {
    const raw = await query<DriverRaw>(DRIVERS_SQL, {});

    const drivers: DriverListItem[] = raw.map((r) => {
      const forename = clean(r.forename);
      const surname = clean(r.surname);
      const realCode = clean(r.code);
      return {
        id: Number(r.driverId),
        name: `${forename ?? ""} ${surname ?? ""}`.trim(),
        code: realCode ?? generateCode(forename, surname),
        nationality: clean(r.nationality),
      };
    });

    return NextResponse.json(
      { drivers },
      {
        headers: {
          "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (err) {
    console.error("[/api/drivers] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load drivers." },
      { status: 500 }
    );
  }
}
