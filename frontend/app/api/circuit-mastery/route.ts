import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { MASTERY_SQL } from "@/lib/ai/mastery-sql";

// Circuit Mastery: ranks a driver's circuits by a composite score that blends
// EFFICIENCY (how well they scored vs. the maximum available, Bayesian-smoothed
// toward the driver's own average so tiny samples don't spike) with DOMINANCE
// (absolute wins + podiums + poles vs. their best circuit).
//
//   mastery = 0.6 * efficiency + 0.4 * dominance
//
// Weekend score (efficiency numerator):
//   Race by finish (classified only): P1 10 · P2 7 · P3 5 · P4 4 · P5 3 ·
//     P6-7 2 · P8-10 1 · else/DNF 0
//   Pole (grid = 1): +5   Fastest lap (rank = 1): +1
//   Sprint: P1 +3 · P2 +2 · P3 +1
// Max-available adapts per weekend (Variant B): pole/FL/sprint only count toward
// the denominator when that data actually exists, so pre-1994 eras aren't punished
// for missing qualifying, and pre-2021 for missing sprints.
//
// Grouping is by physical circuit (circuitId), so Imola under different GP names
// is one circuit. Returns the top 5.


// Country name (circuits.country) -> { iso2 for flagcdn, iso3 for label }
const COUNTRY_CODES: Record<string, { iso2: string; iso3: string }> = {
  Argentina: { iso2: "ar", iso3: "ARG" },
  Australia: { iso2: "au", iso3: "AUS" },
  Austria: { iso2: "at", iso3: "AUT" },
  Azerbaijan: { iso2: "az", iso3: "AZE" },
  Bahrain: { iso2: "bh", iso3: "BHR" },
  Belgium: { iso2: "be", iso3: "BEL" },
  Brazil: { iso2: "br", iso3: "BRA" },
  Canada: { iso2: "ca", iso3: "CAN" },
  China: { iso2: "cn", iso3: "CHN" },
  France: { iso2: "fr", iso3: "FRA" },
  Germany: { iso2: "de", iso3: "GER" },
  Hungary: { iso2: "hu", iso3: "HUN" },
  India: { iso2: "in", iso3: "IND" },
  Italy: { iso2: "it", iso3: "ITA" },
  Japan: { iso2: "jp", iso3: "JPN" },
  Korea: { iso2: "kr", iso3: "KOR" },
  Malaysia: { iso2: "my", iso3: "MAL" },
  Mexico: { iso2: "mx", iso3: "MEX" },
  Monaco: { iso2: "mc", iso3: "MON" },
  Morocco: { iso2: "ma", iso3: "MAR" },
  Netherlands: { iso2: "nl", iso3: "NED" },
  Portugal: { iso2: "pt", iso3: "POR" },
  Qatar: { iso2: "qa", iso3: "QAT" },
  Russia: { iso2: "ru", iso3: "RUS" },
  "Saudi Arabia": { iso2: "sa", iso3: "SAU" },
  Singapore: { iso2: "sg", iso3: "SGP" },
  "South Africa": { iso2: "za", iso3: "RSA" },
  Spain: { iso2: "es", iso3: "ESP" },
  Sweden: { iso2: "se", iso3: "SWE" },
  Switzerland: { iso2: "ch", iso3: "SUI" },
  Turkey: { iso2: "tr", iso3: "TUR" },
  UAE: { iso2: "ae", iso3: "UAE" },
  UK: { iso2: "gb", iso3: "GBR" },
  USA: { iso2: "us", iso3: "USA" },
  "United States": { iso2: "us", iso3: "USA" },
};

type MasteryRow = {
  circuit: string;
  country: string | null;
  starts: number | string;
  wins: number | string;
  podiums: number | string;
  poles: number | string;
  sprint_wins: number | string;
  sprint_podiums: number | string;
  sprint_poles: number | string;
  sprint_count: number | string;
  mastery: number | string;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Invalid or missing 'id' query param." },
      { status: 400 }
    );
  }

  try {
    const rows = await query<MasteryRow>(MASTERY_SQL, { id });

    const circuits = rows.map((row, index) => {
      const codes = row.country ? COUNTRY_CODES[row.country] : undefined;
      const sprintCount = num(row.sprint_count);
      // Sprint columns are null when the driver never had a sprint at this circuit
      const hasSprint = sprintCount > 0;
      return {
        rank: index + 1,
        name: row.circuit,
        countryCode: codes?.iso2 ?? "",
        country: codes?.iso3 ?? (row.country ?? ""),
        mastery: num(row.mastery),
        starts: num(row.starts),
        raceWins: num(row.wins),
        racePodiums: num(row.podiums),
        racePoles: num(row.poles),
        sprintWins: hasSprint ? num(row.sprint_wins) : null,
        sprintPodiums: hasSprint ? num(row.sprint_podiums) : null,
        sprintPoles: hasSprint ? num(row.sprint_poles) : null,
      };
    });

    return NextResponse.json(
      { circuits },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[/api/circuit-mastery] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load circuit mastery." },
      { status: 500 }
    );
  }
}
