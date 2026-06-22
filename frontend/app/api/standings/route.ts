import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { teamColor } from "@/lib/team-colors";

// Map BigQuery constructorRef -> short display key (TEAM_LABEL/риска). Colour comes from lib/team-colors.ts.
// Unknown refs fall back to the raw team name (bar still renders; color may be missing).
const REF_TO_KEY: Record<string, string> = {
  red_bull: "RedBull",
  mclaren: "McLaren",
  ferrari: "Ferrari",
  mercedes: "Mercedes",
  aston_martin: "Aston",
  alpine: "Alpine",
  williams: "Williams",
  rb: "RB",
  toro_rosso: "RB",
  alphatauri: "RB",
  haas: "Haas",
  sauber: "Sauber",
  alfa: "Sauber",
};

type Mode = "drivers" | "constructors";

type StandingRow = {
  name: string;
  team: string;
  color: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  wins: number;
  p2: number;
  p3: number;
  tooltip: string;
};

type DriverRaw = {
  forename: string;
  surname: string;
  teamRef: string | null;
  teamName: string | null;
  points: number;
  wins: number;
  gold: number;
  silver: number;
  bronze: number;
  p2: number;
  p3: number;
};

type ConstructorRaw = {
  name: string;
  teamRef: string | null;
  points: number;
  wins: number;
  gold: number;
  silver: number;
  bronze: number;
  p2: number;
  p3: number;
  members: string | null;
};

function teamKey(ref: string | null, name: string | null): string {
  if (ref && REF_TO_KEY[ref]) return REF_TO_KEY[ref];
  return name ?? ref ?? "Unknown";
}

// gold/silver/bronze = REAL points scored at P1/P2/P3 (Logika B), summed over
// races + sprints. p2/p3 here are COUNTS of those finishes (mock used counts).
const DRIVERS_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
),
pos AS (
  SELECT res.driverId, SAFE_CAST(res.position AS INT64) AS position, res.points
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
  UNION ALL
  SELECT sp.driverId, SAFE_CAST(sp.position AS INT64) AS position, sp.points
  FROM ${fq("sprint_results")} sp
  JOIN ${fq("races")} r ON sp.raceId = r.raceId
  WHERE r.year = @season
),
medals AS (
  SELECT driverId,
    SUM(IF(position = 1, points, 0)) AS gold,
    SUM(IF(position = 2, points, 0)) AS silver,
    SUM(IF(position = 3, points, 0)) AS bronze,
    COUNTIF(position = 2) AS p2,
    COUNTIF(position = 3) AS p3
  FROM pos
  GROUP BY driverId
),
last_team AS (
  SELECT driverId, constructorId FROM (
    SELECT res.driverId, res.constructorId,
      ROW_NUMBER() OVER (PARTITION BY res.driverId ORDER BY r.round DESC) AS rn
    FROM ${fq("results")} res
    JOIN ${fq("races")} r ON res.raceId = r.raceId
    WHERE r.year = @season
  ) WHERE rn = 1
)
SELECT
  d.forename AS forename,
  d.surname AS surname,
  con.constructorRef AS teamRef,
  con.name AS teamName,
  ds.points AS points,
  ds.wins AS wins,
  COALESCE(m.gold, 0)   AS gold,
  COALESCE(m.silver, 0) AS silver,
  COALESCE(m.bronze, 0) AS bronze,
  COALESCE(m.p2, 0)     AS p2,
  COALESCE(m.p3, 0)     AS p3
FROM ${fq("driver_standings")} ds
JOIN ${fq("races")} r       ON ds.raceId = r.raceId
JOIN ${fq("drivers")} d     ON ds.driverId = d.driverId
LEFT JOIN medals m          ON m.driverId = ds.driverId
LEFT JOIN last_team lt      ON lt.driverId = ds.driverId
LEFT JOIN ${fq("constructors")} con ON con.constructorId = lt.constructorId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY ds.position
`;

const CONSTRUCTORS_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
),
pos AS (
  SELECT res.constructorId, SAFE_CAST(res.position AS INT64) AS position, res.points
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  WHERE r.year = @season
  UNION ALL
  SELECT sp.constructorId, SAFE_CAST(sp.position AS INT64) AS position, sp.points
  FROM ${fq("sprint_results")} sp
  JOIN ${fq("races")} r ON sp.raceId = r.raceId
  WHERE r.year = @season
),
medals AS (
  SELECT constructorId,
    SUM(IF(position = 1, points, 0)) AS gold,
    SUM(IF(position = 2, points, 0)) AS silver,
    SUM(IF(position = 3, points, 0)) AS bronze,
    COUNTIF(position = 2) AS p2,
    COUNTIF(position = 3) AS p3
  FROM pos
  GROUP BY constructorId
),
team_drivers AS (
  SELECT res.constructorId,
    STRING_AGG(DISTINCT d.surname, ', ' ORDER BY d.surname) AS members
  FROM ${fq("results")} res
  JOIN ${fq("races")} r   ON res.raceId = r.raceId
  JOIN ${fq("drivers")} d ON res.driverId = d.driverId
  WHERE r.year = @season
  GROUP BY res.constructorId
)
SELECT
  con.name AS name,
  con.constructorRef AS teamRef,
  cs.points AS points,
  cs.wins AS wins,
  COALESCE(m.gold, 0)   AS gold,
  COALESCE(m.silver, 0) AS silver,
  COALESCE(m.bronze, 0) AS bronze,
  COALESCE(m.p2, 0)     AS p2,
  COALESCE(m.p3, 0)     AS p3,
  td.members            AS members
FROM ${fq("constructor_standings")} cs
JOIN ${fq("races")} r           ON cs.raceId = r.raceId
JOIN ${fq("constructors")} con  ON cs.constructorId = con.constructorId
LEFT JOIN medals m              ON m.constructorId = cs.constructorId
LEFT JOIN team_drivers td       ON td.constructorId = cs.constructorId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY cs.position
`;

// Surnames that always get an initial (relatives who raced across many seasons,
// so the initial avoids ambiguity even in seasons where only one of them appears).
const ALWAYS_INITIAL = new Set(["Schumacher"]);

// Build display name: "Surname", or "F. Surname" when the surname is duplicated
// within this season, or is in the ALWAYS_INITIAL set.
function displayName(
  forename: string,
  surname: string,
  duplicatedSurnames: Set<string>
): string {
  const needsInitial =
    duplicatedSurnames.has(surname) || ALWAYS_INITIAL.has(surname);
  if (needsInitial && forename) {
    return `${forename.charAt(0)}. ${surname}`;
  }
  return surname;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seasonRaw = searchParams.get("season");
  const mode = (searchParams.get("mode") ?? "drivers") as Mode;

  const season = Number(seasonRaw);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    return NextResponse.json(
      { error: "Invalid or missing 'season' query param." },
      { status: 400 }
    );
  }

  try {
    let rows: StandingRow[];

    if (mode === "constructors") {
      const raw = await query<ConstructorRaw>(CONSTRUCTORS_SQL, { season });
      rows = raw.map((r) => ({
        name: r.name,
        team: teamKey(r.teamRef, r.name),
        color: teamColor(r.teamRef, season),
        points: Number(r.points),
        gold: Number(r.gold),
        silver: Number(r.silver),
        bronze: Number(r.bronze),
        wins: Number(r.wins),
        p2: Number(r.p2),
        p3: Number(r.p3),
        tooltip: r.members ?? "",
      }));
    } else {
      const raw = await query<DriverRaw>(DRIVERS_SQL, { season });

      // Count surnames appearing more than once this season.
      const surnameCount = new Map<string, number>();
      for (const r of raw) {
        surnameCount.set(r.surname, (surnameCount.get(r.surname) ?? 0) + 1);
      }
      const duplicated = new Set(
        [...surnameCount.entries()].filter(([, n]) => n > 1).map(([s]) => s)
      );

      rows = raw.map((r) => ({
        name: displayName(r.forename, r.surname, duplicated),
        team: teamKey(r.teamRef, r.teamName),
        color: teamColor(r.teamRef, season),
        points: Number(r.points),
        gold: Number(r.gold),
        silver: Number(r.silver),
        bronze: Number(r.bronze),
        wins: Number(r.wins),
        p2: Number(r.p2),
        p3: Number(r.p3),
        tooltip: r.teamName ?? "",
      }));
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[/api/standings] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load standings." },
      { status: 500 }
    );
  }
}
