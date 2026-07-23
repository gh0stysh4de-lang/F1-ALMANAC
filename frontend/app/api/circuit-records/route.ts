import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";

// Four records for a circuit, agreed after review: fastest qualifying lap,
// fastest race lap, fastest pit stop, fastest lap speed. Each driver +
// team + year. Run as separate parallel queries — different grains (one row
// per driver-lap, one per pit stop), so independent small queries stay far
// more readable than forcing them into one combined statement.
//
// Time parsing: fastestLapTime and qualifying.q1/q2/q3 are strings like
// "1:23.456". A plain ORDER BY on that string is wrong — "9:59" sorts before
// "10:00" lexicographically. Every lap-time query converts to seconds first
// via SPLIT + SAFE_CAST, the same pattern this project already uses for
// pit_stops.duration ("16:12.356" for stops under a red flag).
//
// Honesty notes, surfaced to the client rather than buried in a comment:
//   - "Fastest Qualifying Lap" spans three very different qualifying formats
//     (single timed lap pre-2003, knockout aggregate 2003-05, Q1/Q2/Q3 since
//     2006). Labelled "fastest recorded", not "record" or "absolute".
//   - "Fastest Pit Stop" only has data from 2011 — pit_stops has no earlier
//     rows, so this is simply absent (not zero) for circuits whose F1 history
//     predates the sport's pit-stop timing.
//   - "Fastest Lap Speed" is results.fastestLapSpeed: the AVERAGE speed over
//     the fastest lap, not peak speed on a straight ("trap speed" — the
//     Bottas-at-372-km/h kind of number). This project has no trap-speed
//     data anywhere, so the tile is named for what it actually measures
//     rather than borrowing the more famous stat's name.

function parseTimeSeconds(column: string): string {
  // "M:SS.sss" -> minutes*60 + seconds. SAFE_OFFSET (not OFFSET) is essential:
  // a value without a colon — an empty string, "\N" left over from CSV import,
  // or a bare-seconds string — makes SPLIT return a 1-element array, and
  // OFFSET(1) on that throws "array index out of bounds", which SAFE_CAST does
  // NOT catch (the error is in the subscript, before the cast). That thrown
  // error rejects the whole query, which is exactly why the qualifying tile
  // came back empty while the others worked. SAFE_OFFSET returns NULL instead,
  // and the outer WHERE seconds IS NOT NULL filters those rows out cleanly.
  return `SAFE_CAST(SPLIT(${column}, ':')[SAFE_OFFSET(0)] AS FLOAT64) * 60 +
          SAFE_CAST(SPLIT(${column}, ':')[SAFE_OFFSET(1)] AS FLOAT64)`;
}

const FASTEST_QUALI_SQL = `
WITH quali_times AS (
  SELECT driverId, raceId, constructorId, q1 AS t FROM ${fq("qualifying")} WHERE q1 IS NOT NULL AND q1 != '' AND q1 LIKE '%:%'
  UNION ALL
  SELECT driverId, raceId, constructorId, q2 FROM ${fq("qualifying")} WHERE q2 IS NOT NULL AND q2 != '' AND q2 LIKE '%:%'
  UNION ALL
  SELECT driverId, raceId, constructorId, q3 FROM ${fq("qualifying")} WHERE q3 IS NOT NULL AND q3 != '' AND q3 LIKE '%:%'
),
parsed AS (
  SELECT qt.driverId, qt.constructorId, qt.t, r.year,
    ${parseTimeSeconds("qt.t")} AS seconds
  FROM quali_times qt
  JOIN ${fq("races")} r ON r.raceId = qt.raceId
  WHERE r.circuitId = @id
)
SELECT d.forename, d.surname, con.name AS team, p.year, p.t AS lapTime
FROM parsed p
JOIN ${fq("drivers")} d ON d.driverId = p.driverId
JOIN ${fq("constructors")} con ON con.constructorId = p.constructorId
WHERE p.seconds IS NOT NULL
ORDER BY p.seconds ASC
LIMIT 1
`;

const FASTEST_RACE_LAP_SQL = `
WITH parsed AS (
  SELECT res.driverId, res.constructorId, r.year, res.fastestLapTime,
    ${parseTimeSeconds("res.fastestLapTime")} AS seconds
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.fastestLapTime IS NOT NULL
    AND res.fastestLapTime != '' AND res.fastestLapTime LIKE '%:%'
)
SELECT d.forename, d.surname, con.name AS team, p.year, p.fastestLapTime AS lapTime
FROM parsed p
JOIN ${fq("drivers")} d ON d.driverId = p.driverId
JOIN ${fq("constructors")} con ON con.constructorId = p.constructorId
WHERE p.seconds IS NOT NULL
ORDER BY p.seconds ASC
LIMIT 1
`;

// duration is PIT LANE time (entry + stop + exit), not the ~2s stationary
// tyre change — that figure isn't in this dataset at all. Sort by the parsed
// duration, NOT by milliseconds: red-flag stops store a "mm:ss.sss" duration
// with a NULL milliseconds, so ordering by milliseconds would sink those NULLs
// to the top and "win" with a 35-minute stop. SAFE_CAST turns "35:51.478" into
// NULL, and the WHERE drops it, leaving only real numeric-second durations.
const FASTEST_PIT_STOP_SQL = `
SELECT d.forename, d.surname, con.name AS team, r.year, ps.duration,
  SAFE_CAST(ps.duration AS FLOAT64) AS seconds
FROM ${fq("pit_stops")} ps
JOIN ${fq("races")} r ON r.raceId = ps.raceId
JOIN ${fq("drivers")} d ON d.driverId = ps.driverId
JOIN ${fq("results")} res ON res.raceId = ps.raceId AND res.driverId = ps.driverId
JOIN ${fq("constructors")} con ON con.constructorId = res.constructorId
WHERE r.circuitId = @id AND SAFE_CAST(ps.duration AS FLOAT64) IS NOT NULL
ORDER BY seconds ASC
LIMIT 1
`;

// fastestLapSpeed is numeric (FLOAT64) in this dataset — the SAFE_CAST is a
// harmless no-op that also tolerates the field being STRING in other imports,
// so it stays for portability. No colon-parsing needed, unlike the lap times.
const FASTEST_SPEED_SQL = `
WITH parsed AS (
  SELECT res.driverId, res.constructorId, r.year, res.fastestLapSpeed,
    SAFE_CAST(res.fastestLapSpeed AS FLOAT64) AS speed
  FROM ${fq("results")} res
  JOIN ${fq("races")} r ON r.raceId = res.raceId
  WHERE r.circuitId = @id AND res.fastestLapSpeed IS NOT NULL
)
SELECT d.forename, d.surname, con.name AS team, p.year, p.speed AS speed
FROM parsed p
JOIN ${fq("drivers")} d ON d.driverId = p.driverId
JOIN ${fq("constructors")} con ON con.constructorId = p.constructorId
WHERE p.speed IS NOT NULL
ORDER BY p.speed DESC
LIMIT 1
`;

type WhoRow = { forename: string; surname: string; team: string; year: number };
type LapRow = WhoRow & { lapTime: string };
type PitRow = WhoRow & { duration: string; seconds: number };
type SpeedRow = WhoRow & { speed: number };

function who(r: WhoRow) {
  return { driver: `${r.forename} ${r.surname}`, team: r.team, year: r.year };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("id");
  const id = Number(raw);

  if (!raw || !Number.isInteger(id)) {
    return NextResponse.json(
      { error: "Query param `id` must be an integer circuitId" },
      { status: 400 }
    );
  }

  try {
    // allSettled, not all: a single failing query (a malformed time string, a
    // missing column in one edge-case row) must not blank the entire block.
    // Each tile resolves independently; a rejected one logs which query broke
    // and renders as an empty tile instead of taking the other three down.
    const settled = await Promise.allSettled([
      query<LapRow>(FASTEST_QUALI_SQL, { id }),
      query<LapRow>(FASTEST_RACE_LAP_SQL, { id }),
      query<PitRow>(FASTEST_PIT_STOP_SQL, { id }),
      query<SpeedRow>(FASTEST_SPEED_SQL, { id }),
    ]);

    const names = ["fastestQualifyingLap", "fastestRaceLap", "fastestPitStop", "fastestLapSpeed"];
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[/api/circuit-records] ${names[i]} query failed:`, r.reason);
      }
    });

    const rowsOf = <T,>(i: number): T[] =>
      settled[i].status === "fulfilled"
        ? (settled[i] as PromiseFulfilledResult<T[]>).value
        : [];

    const quali = rowsOf<LapRow>(0);
    const raceLap = rowsOf<LapRow>(1);
    const pit = rowsOf<PitRow>(2);
    const speed = rowsOf<SpeedRow>(3);

    const records = {
      fastestQualifyingLap: quali[0]
        ? { value: quali[0].lapTime, ...who(quali[0]) }
        : null,
      fastestRaceLap: raceLap[0]
        ? { value: raceLap[0].lapTime, ...who(raceLap[0]) }
        : null,
      fastestPitStop: pit[0]
        ? { value: `${pit[0].seconds.toFixed(2)}s`, ...who(pit[0]) }
        : null,
      fastestLapSpeed: speed[0]
        ? { value: `${speed[0].speed.toFixed(1)} km/h`, ...who(speed[0]) }
        : null,
    };

    return NextResponse.json(
      { records },
      {
        headers: {
          "Cache-Control":
            process.env.NODE_ENV === "production"
              ? "public, max-age=3600"
              : "no-store",
        },
      }
    );
  } catch (err) {
    console.error("[/api/circuit-records]", err);
    return NextResponse.json(
      { error: "Failed to load circuit records" },
      { status: 500 }
    );
  }
}
