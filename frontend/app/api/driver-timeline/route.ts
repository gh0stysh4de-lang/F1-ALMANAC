import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { teamColor } from "@/lib/team-colors";

// Career timeline endpoint: per-season team (for the coloured stints) and
// per-season championship finishing position (for the labels above the bar).
//
// Stint team per season = the constructor the driver entered the most races
// with that year (handles mid-season switches by majority of starts).
//
// Position per season = standings.position after the LAST round that actually
// has a standings row for this driver that year. For completed seasons that is
// the final classification; for the current season it is the latest provisional
// standing (flagged isLive).

const TEAM_BY_SEASON_SQL = `
WITH season_team AS (
  SELECT
    r.year,
    c.constructorRef AS ref,
    c.name AS team,
    ROW_NUMBER() OVER (
      PARTITION BY r.year
      ORDER BY COUNT(*) DESC, MAX(r.round) DESC
    ) AS rn
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON res.raceId = r.raceId
  JOIN ${fq("constructors")} c ON res.constructorId = c.constructorId
  WHERE res.driverId = @id
  GROUP BY r.year, c.constructorRef, c.name
)
SELECT year, ref, team
FROM season_team
WHERE rn = 1
ORDER BY year
`;

const POSITION_BY_SEASON_SQL = `
SELECT
  r.year,
  ds.position,
  -- latest round that has a standings row for this driver this season
  r.round AS standings_round,
  -- total rounds on the calendar this season (to detect an in-progress year)
  (SELECT MAX(r3.round) FROM ${fq("races")} r3 WHERE r3.year = r.year) AS calendar_rounds
FROM ${fq("driver_standings")} ds
JOIN ${fq("races")} r ON ds.raceId = r.raceId
WHERE ds.driverId = @id
  AND r.round = (
    SELECT MAX(r2.round)
    FROM ${fq("driver_standings")} ds2
    JOIN ${fq("races")} r2 ON ds2.raceId = r2.raceId
    WHERE r2.year = r.year AND ds2.driverId = @id
  )
ORDER BY r.year
`;

type TeamRow = { year: number; ref: string | null; team: string | null };
type PositionRow = {
  year: number;
  position: number | null;
  standings_round: number;
  calendar_rounds: number;
};

// API response shapes (match the timeline component contract).
type Stint = {
  team: string;
  color: string;
  startYear: number;
  endYear: number;
};
type SeasonPosition = {
  position: number | null;
  isLive?: boolean;
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
    const [teamRows, posRows] = await Promise.all([
      query<TeamRow>(TEAM_BY_SEASON_SQL, { id }),
      query<PositionRow>(POSITION_BY_SEASON_SQL, { id }),
    ]);

    // Resolve each season's colour, then merge consecutive same-team+colour
    // years into a single stint.
    const perYear = teamRows.map((row) => {
      const year = num(row.year);
      const team = row.team ?? "Unknown";
      const color = teamColor(row.ref, year);
      return { year, team, color };
    });

    const stints: Stint[] = [];
    for (const cur of perYear) {
      const last = stints[stints.length - 1];
      if (last && last.team === cur.team && last.color === cur.color) {
        last.endYear = cur.year; // extend the current run
      } else {
        stints.push({
          team: cur.team,
          color: cur.color,
          startYear: cur.year,
          endYear: cur.year,
        });
      }
    }

    // Build the season -> position map. A season is "live" when its latest
    // standings round is below the full calendar (i.e. still in progress).
    const seasonPositions: Record<number, SeasonPosition> = {};
    for (const row of posRows) {
      const year = num(row.year);
      const position = row.position === null ? null : num(row.position);
      const standingsRound = num(row.standings_round);
      const calendarRounds = num(row.calendar_rounds);
      const isLive = standingsRound < calendarRounds;
      seasonPositions[year] = isLive ? { position, isLive: true } : { position };
    }

    return NextResponse.json(
      { stints, seasonPositions },
      {
        headers: {
          // shorter cache than static endpoints: the current season changes weekly
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/driver-timeline] query failed:", err);
    return NextResponse.json(
      { error: "Failed to load driver timeline." },
      { status: 500 }
    );
  }
}
