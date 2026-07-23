import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// The drivers who raced for a constructor, ranked by wins-for-team then races.
// Powers the "Notable Drivers" panel — the human face of a team's history.
// Full-height panel now, so up to 20 drivers.
const DRIVERS_SQL = `
WITH race AS (
  SELECT
    res.driverId,
    COUNT(DISTINCT res.raceId)             AS races,
    COUNTIF(res.position = 1)              AS wins,
    COUNTIF(res.position BETWEEN 1 AND 3)  AS podiums,
    COUNTIF(res.grid = 1)                  AS poles,
    MIN(r.year)                            AS first_year,
    MAX(r.year)                            AS last_year
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE res.constructorId = @id
  GROUP BY res.driverId
),
sprint AS (
  SELECT driverId, COUNTIF(positionOrder = 1) AS sprint_wins
  FROM ${fq("sprint_results")}
  WHERE constructorId = @id
  GROUP BY driverId
)
SELECT
  d.driverId,
  d.forename,
  d.surname,
  d.code,
  d.nationality,
  race.races,
  race.wins,
  race.podiums,
  race.poles,
  COALESCE(sprint.sprint_wins, 0) AS sprint_wins,
  race.first_year,
  race.last_year
FROM race
JOIN ${fq("drivers")} d ON d.driverId = race.driverId
LEFT JOIN sprint ON sprint.driverId = race.driverId
ORDER BY race.wins DESC, race.podiums DESC, race.poles DESC, race.races DESC
LIMIT 20
`;

type Raw = {
  driverId: number;
  forename: unknown;
  surname: unknown;
  code: unknown;
  nationality: unknown;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  sprint_wins: number;
  first_year: number | null;
  last_year: number | null;
};

type DriverEntry = {
  id: number;
  name: string;
  code: string | null;
  nationality: string | null;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  years: string;
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
    const rows = await query<Raw>(DRIVERS_SQL, { id });

    const drivers: DriverEntry[] = rows.map((r) => {
      const forename = clean(r.forename) ?? "";
      const surname = clean(r.surname) ?? "";
      return {
        id: Number(r.driverId),
        name: `${forename} ${surname}`.trim(),
        code: clean(r.code),
        nationality: clean(r.nationality),
        races: Number(r.races),
        wins: Number(r.wins),
        podiums: Number(r.podiums),
        poles: Number(r.poles),
        sprintWins: Number(r.sprint_wins),
        years: formatYears(
          r.first_year === null ? null : Number(r.first_year),
          r.last_year === null ? null : Number(r.last_year)
        ),
      };
    });

    return NextResponse.json(
      { drivers },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[/api/constructor-drivers] query failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to load constructor drivers.", detail },
      { status: 500 }
    );
  }
}
