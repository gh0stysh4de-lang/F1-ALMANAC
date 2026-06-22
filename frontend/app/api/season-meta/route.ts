import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

const META_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId WHERE r.year = @season
),
latest_season AS (
  SELECT MAX(year) AS y FROM ${fq("seasons")}
),
counts AS (
  SELECT
    (SELECT COUNT(*) FROM ${fq("races")} r WHERE r.year = @season) AS rounds,
    (SELECT COUNT(DISTINCT res.driverId)
       FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId
       WHERE r.year = @season) AS drivers,
    (SELECT COUNT(DISTINCT res.constructorId)
       FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId
       WHERE r.year = @season) AS teams
),
leader AS (
  SELECT d.forename || ' ' || d.surname AS name
  FROM ${fq("driver_standings")} ds
  JOIN ${fq("races")} r   ON ds.raceId = r.raceId
  JOIN ${fq("drivers")} d ON ds.driverId = d.driverId
  WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
  ORDER BY ds.position
  LIMIT 1
),
top_team AS (
  SELECT con.name AS name
  FROM ${fq("constructor_standings")} cs
  JOIN ${fq("races")} r           ON cs.raceId = r.raceId
  JOIN ${fq("constructors")} con  ON cs.constructorId = con.constructorId
  WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
  ORDER BY cs.position
  LIMIT 1
)
SELECT
  sd.title AS title,
  sd.description AS description,
  (@season = (SELECT y FROM latest_season)) AS isLatest,
  c.rounds AS rounds,
  c.drivers AS drivers,
  c.teams AS teams,
  (SELECT name FROM leader) AS leader,
  (SELECT name FROM top_team) AS topTeam
FROM counts c
LEFT JOIN ${fq("season_descriptions")} sd ON sd.season = @season
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get("season"));
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    return NextResponse.json({ error: "Invalid 'season'." }, { status: 400 });
  }

  try {
    const rows = await query<{
      title: string | null;
      description: string | null;
      isLatest: boolean;
      rounds: number;
      drivers: number;
      teams: number;
      leader: string | null;
      topTeam: string | null;
    }>(META_SQL, { season });

    const r = rows[0];
    if (!r) {
      return NextResponse.json({ error: "Season not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        title: r.title ?? `${season} FIA Formula One World Championship`,
        description: r.description ?? "",
        live: !!r.isLatest,
        stats: {
          rounds: Number(r.rounds) || 0,
          drivers: Number(r.drivers) || 0,
          teams: Number(r.teams) || 0,
          leader: r.leader ?? "—",
          topTeam: r.topTeam ?? "—",
        },
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("[/api/season-meta] query failed:", err);
    return NextResponse.json({ error: "Failed to load season meta." }, { status: 500 });
  }
}
