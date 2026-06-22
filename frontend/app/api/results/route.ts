import { NextRequest, NextResponse } from "next/server";
import { query, fq } from "@/lib/bigquery";
import { teamColor } from "@/lib/team-colors";

// constructorRef -> short display key. Colour comes from lib/team-colors.ts.
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

// country -> ISO-2 (for flagcdn). Kept broad; unknown -> undefined (no flag).
const COUNTRY_ISO2: Record<string, string> = {
  Argentina: "ar", Australia: "au", Austria: "at", Azerbaijan: "az",
  Bahrain: "bh", Belgium: "be", Brazil: "br", Canada: "ca", China: "cn",
  France: "fr", Germany: "de", Hungary: "hu", India: "in", Italy: "it",
  Japan: "jp", Korea: "kr", Malaysia: "my", Mexico: "mx", Monaco: "mc",
  Morocco: "ma", Netherlands: "nl", Portugal: "pt", Qatar: "qa", Russia: "ru",
  "Saudi Arabia": "sa", Singapore: "sg", "South Africa": "za", Spain: "es",
  Sweden: "se", Switzerland: "ch", Turkey: "tr", UAE: "ae", UK: "gb",
  USA: "us", "United States": "us",
};

// Known race-name -> 3-letter column code. Disambiguates multiple GPs per country.
const NAME_TO_CODE: Record<string, string> = {
  "Bahrain Grand Prix": "BHR",
  "Saudi Arabian Grand Prix": "SAU",
  "Australian Grand Prix": "AUS",
  "Japanese Grand Prix": "JPN",
  "Chinese Grand Prix": "CHN",
  "Miami Grand Prix": "MIA",
  "Emilia Romagna Grand Prix": "EMI",
  "Monaco Grand Prix": "MON",
  "Canadian Grand Prix": "CAN",
  "Spanish Grand Prix": "ESP",
  "Austrian Grand Prix": "AUT",
  "British Grand Prix": "GBR",
  "Hungarian Grand Prix": "HUN",
  "Belgian Grand Prix": "BEL",
  "Dutch Grand Prix": "NED",
  "Italian Grand Prix": "ITA",
  "Azerbaijan Grand Prix": "AZE",
  "Singapore Grand Prix": "SGP",
  "United States Grand Prix": "USA",
  "Mexico City Grand Prix": "MEX",
  "Mexican Grand Prix": "MEX",
  "São Paulo Grand Prix": "BRA",
  "Brazilian Grand Prix": "BRA",
  "Las Vegas Grand Prix": "LVG",
  "Qatar Grand Prix": "QAT",
  "Abu Dhabi Grand Prix": "ABU",
  "French Grand Prix": "FRA",
  "German Grand Prix": "GER",
  "Portuguese Grand Prix": "POR",
  "Turkish Grand Prix": "TUR",
  "Russian Grand Prix": "RUS",
  "Eifel Grand Prix": "EIF",
  "Styrian Grand Prix": "STY",
  "Tuscan Grand Prix": "TUS",
  "Sakhir Grand Prix": "SKH",
  "70th Anniversary Grand Prix": "ANV",
  "European Grand Prix": "EUR",
  "Pacific Grand Prix": "PAC",
  "San Marino Grand Prix": "SMR",
  "Luxembourg Grand Prix": "LUX",
  "Malaysian Grand Prix": "MAL",
  "Korean Grand Prix": "KOR",
  "Indian Grand Prix": "IND",
};

function gpCode(name: string, country: string | null): string {
  if (NAME_TO_CODE[name]) return NAME_TO_CODE[name];
  if (country) return country.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

function teamKey(ref: string | null): string | null {
  if (ref && REF_TO_KEY[ref]) return REF_TO_KEY[ref];
  return ref; // fall back to raw ref; component tolerates missing color
}

// Short 3-letter label for a constructor row in the matrix.
const TEAM_LABEL: Record<string, string> = {
  RedBull: "RBR",
  McLaren: "MCL",
  Ferrari: "FER",
  Mercedes: "MER",
  Aston: "AST",
  Alpine: "ALP",
  Williams: "WIL",
  RB: "RB",
  Haas: "HAA",
  Sauber: "SAU",
};
function teamLabel(ref: string | null): string {
  const key = teamKey(ref);
  if (key && TEAM_LABEL[key]) return TEAM_LABEL[key];
  return (key ?? ref ?? "—").slice(0, 3).toUpperCase();
}

type RaceRow = { round: number; name: string; country: string | null };
type ResultRow = {
  round: number;
  driverId: number;
  driverCode: string | null;
  surname: string;
  teamRef: string | null;
  position: number | null;
  grid: number | null;
  status: string;
  finished: boolean;
  points: number | null;
  laps: number | null;
  fastestLapTime: string | null;
  flRank: number | null;
  gapText: string | null;
  gapMs: number | null;
};

const CALENDAR_SQL = `
SELECT r.round AS round, r.name AS name, c.country AS country
FROM ${fq("races")} r
JOIN ${fq("circuits")} c ON r.circuitId = c.circuitId
WHERE r.year = @season
ORDER BY r.round
`;

// One row per (driver, race) for the season. Driver order will be set by
// final championship position (via driver_standings) on the client side;
// here we just return everything and let JS assemble the grid.
const RESULTS_SQL = `
SELECT
  r.round AS round,
  res.driverId AS driverId,
  d.code AS driverCode,
  d.surname AS surname,
  con.constructorRef AS teamRef,
  SAFE_CAST(res.position AS INT64) AS position,
  res.grid AS grid,
  COALESCE(s.status, '') AS status,
  (s.status = 'Finished'
   OR s.status LIKE '%Lap%'
   OR (s.status IS NULL AND res.position IS NOT NULL)) AS finished,
  res.points AS points,
  res.laps AS laps,
  res.fastestLapTime AS fastestLapTime,
  SAFE_CAST(res.rank AS INT64) AS flRank,
  res.time AS gapText,
  res.milliseconds AS gapMs
FROM ${fq("results")} res
JOIN ${fq("races")} r        ON res.raceId = r.raceId
JOIN ${fq("drivers")} d      ON res.driverId = d.driverId
JOIN ${fq("constructors")} con ON res.constructorId = con.constructorId
LEFT JOIN ${fq("status")} s  ON res.statusId = s.statusId
WHERE r.year = @season
ORDER BY r.round
`;

// Final-standings order of drivers, to sort matrix rows top-to-bottom.
const ORDER_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId WHERE r.year = @season
)
SELECT ds.driverId AS driverId, d.surname AS surname, d.code AS driverCode, ds.position AS position
FROM ${fq("driver_standings")} ds
JOIN ${fq("races")} r   ON ds.raceId = r.raceId
JOIN ${fq("drivers")} d ON ds.driverId = d.driverId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY ds.position
`;

// Final-standings order of constructors.
const ORDER_CON_SQL = `
WITH final_round AS (
  SELECT MAX(r.round) AS round FROM ${fq("results")} res JOIN ${fq("races")} r ON res.raceId = r.raceId WHERE r.year = @season
)
SELECT con.constructorRef AS teamRef, con.name AS name, cs.position AS position
FROM ${fq("constructor_standings")} cs
JOIN ${fq("races")} r          ON cs.raceId = r.raceId
JOIN ${fq("constructors")} con ON cs.constructorId = con.constructorId
WHERE r.year = @season AND r.round = (SELECT round FROM final_round)
ORDER BY cs.position
`;

// Build a human gap string from a result row.
// Winner -> "Winner"; same-lap finisher -> "+5.123s" (results.time holds the gap);
// lapped -> "+1 Lap" (from status); otherwise (DNF / no data) -> null ("—" on client).
function buildGap(row: ResultRow): string | null {
  if (row.position === 1) return "Winner";
  const t = row.gapText?.trim();
  if (t && t.startsWith("+")) {
    // already a delta like "+5.123" -> append unit if it looks like seconds
    return /^\+\d/.test(t) && t.includes(".") ? `${t}s` : t;
  }
  const lap = row.status.match(/^\+(\d+)\s+Lap/i);
  if (lap) return `+${lap[1]} Lap${lap[1] === "1" ? "" : "s"}`;
  return null;
}

// A driver's 3-letter code may be missing, empty, or the Ergast NULL marker "\\N".
// In those cases fall back to the surname for both display and identity.
// Short display label when a real 3-letter code is missing: first 3 letters of
// the surname, uppercased (e.g. "Baumgartner" -> "BAU", "da Matta" -> "MAT").
function shortLabel(surname: string): string {
  const letters = surname.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || surname.slice(0, 3)).toUpperCase();
}

function cleanCode(code: string | null): string | null {
  if (!code) return null;
  const t = code.trim();
  if (!t || t === "\\N") return null;
  return t;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get("season"));
  const mode = searchParams.get("mode") === "constructors" ? "constructors" : "drivers";
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    return NextResponse.json({ error: "Invalid 'season'." }, { status: 400 });
  }

  try {
    const [races, results, order, orderCon] = await Promise.all([
      query<RaceRow>(CALENDAR_SQL, { season }),
      query<ResultRow>(RESULTS_SQL, { season }),
      query<{ driverId: number; surname: string; driverCode: string | null; position: number }>(
        ORDER_SQL,
        { season }
      ),
      mode === "constructors"
        ? query<{ teamRef: string | null; name: string; position: number }>(
            ORDER_CON_SQL,
            { season }
          )
        : Promise.resolve([] as { teamRef: string | null; name: string; position: number }[]),
    ]);

    // Calendar (columns), ordered by round.
    const calendar = races.map((r) => ({
      round: r.round,
      name: r.name,
      country: r.country,
      countryCode: r.country ? COUNTRY_ISO2[r.country.trim()] : undefined,
      code: gpCode(r.name, r.country),
    }));
    const rounds = calendar.map((c) => c.round);

    // ---- Constructor mode: cell = team's two best finishes that round ----
    if (mode === "constructors") {
      // Rank helper: finished cars by position (asc); DNFs after; null = no entry.
      const rankVal = (r: ResultRow): number => {
        if (r.finished && r.position !== null) return r.position;
        return 1000; // DNF / unclassified sort last
      };

      type ConCell = {
        best: number | "DNF" | null;
        second: number | "DNF" | null;
      };
      // byTeam[teamRef][round] = sorted ResultRow[]
      const byTeam = new Map<string, Map<number, ResultRow[]>>();
      for (const row of results) {
        const ref = row.teamRef ?? "unknown";
        let perRound = byTeam.get(ref);
        if (!perRound) {
          perRound = new Map();
          byTeam.set(ref, perRound);
        }
        const arr = perRound.get(row.round) ?? [];
        arr.push(row);
        perRound.set(row.round, arr);
      }

      const toCell = (r: ResultRow | undefined): number | "DNF" | null => {
        if (!r) return null;
        if (!r.finished) return "DNF";
        return r.position;
      };

      // Row order from constructor standings; extras appended alphabetically.
      const orderRefs = orderCon.map((o) => o.teamRef ?? o.name);
      const orderIndex = new Map<string, number>();
      orderRefs.forEach((k, i) => orderIndex.set(k, i));

      const teamRefs = Array.from(byTeam.keys());
      teamRefs.sort((a, b) => {
        const ia = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
        const ib = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b);
      });

      const drivers = teamRefs.map((ref) => {
        const perRound = byTeam.get(ref)!;
        const cells: (ConCell | null)[] = rounds.map((rd) => {
          const arr = perRound.get(rd);
          if (!arr || arr.length === 0) return null;
          const sorted = [...arr].sort((a, b) => rankVal(a) - rankVal(b));
          return {
            best: toCell(sorted[0]),
            second: sorted.length > 1 ? toCell(sorted[1]) : null,
          };
        });
        return {
          code: teamLabel(ref),
          team: teamKey(ref),
          color: teamColor(ref, season),
          results: cells,
        };
      });

      // Details per team×round: list every driver's result that round (for the future tooltip).
      const details: Record<
        string,
        Record<number, { drivers: { code: string; position: number | "DNF" | null; points: number | null }[] }>
      > = {};
      for (const ref of teamRefs) {
        const perRound = byTeam.get(ref)!;
        const key = teamKey(ref) ?? ref;
        const out: Record<number, { drivers: { code: string; position: number | "DNF" | null; points: number | null }[] }> = {};
        for (const rd of rounds) {
          const arr = perRound.get(rd);
          if (!arr) continue;
          out[rd] = {
            drivers: [...arr]
              .sort((a, b) => rankVal(a) - rankVal(b))
              .map((r) => ({
                code: cleanCode(r.driverCode) ?? shortLabel(r.surname),
                position: r.finished ? r.position : "DNF",
                points: r.points,
              })),
          };
        }
        details[key] = out;
      }

      return NextResponse.json(
        { mode: "constructors", calendar, drivers, details },
        { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
      );
    }

    // Driver identity key: prefer 3-letter code, fall back to surname
    // (older eras have null code). We expose `code` to the client either way.
    // Identity key = driverId (always unique). Surnames/codes are NOT unique for
    // relatives without a 3-letter code (e.g. Jody & Ian Scheckter both -> "Scheckter").
    const keyOf = (driverId: number) => String(driverId);

    // Row order from final standings; fall back to first-seen for anyone missing.
    const orderKeys: string[] = order.map((o) => keyOf(o.driverId));
    const orderIndex = new Map<string, number>();
    orderKeys.forEach((k, i) => orderIndex.set(k, i));

    // Assemble per-driver rows.
    type Detail = {
      position: number | null;
      finished: boolean;
      grid: number | null;
      status: string;
      points: number | null;
      laps: number | null;
      fastestLapTime: string | null;
      isFastestLap: boolean;
      gap: string | null;
    };
    type Acc = {
      code: string;
      team: string | null;
      rawRef: string | null;
      byRound: Map<number, Detail>;
    };
    const byDriver = new Map<string, Acc>();

    for (const row of results) {
      const key = keyOf(row.driverId);
      let acc = byDriver.get(key);
      if (!acc) {
        acc = {
          code: cleanCode(row.driverCode) ?? shortLabel(row.surname),
          team: teamKey(row.teamRef),
          rawRef: row.teamRef,
          byRound: new Map(),
        };
        byDriver.set(key, acc);
      }
      // Keep the latest team seen (end-of-season livery).
      acc.team = teamKey(row.teamRef) ?? acc.team;
      acc.rawRef = row.teamRef ?? acc.rawRef;
      acc.byRound.set(row.round, {
        position: row.position,
        finished: row.finished,
        grid: row.grid,
        status: row.status,
        points: row.points,
        laps: row.laps,
        fastestLapTime: row.fastestLapTime ?? null,
        isFastestLap: row.flRank === 1,
        gap: buildGap(row),
      });
    }

    // Sort driver keys by final standings, then any extras alphabetically.
    const allKeys = Array.from(byDriver.keys());
    allKeys.sort((a, b) => {
      const ia = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });

    // Ensure display codes are unique (two code-less drivers could share a 3-letter
    // label, e.g. Panis & Pantano -> "PAN"). Disambiguate by appending a digit so
    // the matrix rows and the details map never collide.
    {
      const seen = new Map<string, number>();
      for (const key of allKeys) {
        const acc = byDriver.get(key)!;
        const base = acc.code;
        const n = seen.get(base) ?? 0;
        if (n > 0) acc.code = base.slice(0, 2) + String(n); // e.g. PAN -> PA1
        seen.set(base, n + 1);
      }
    }

    const drivers = allKeys.map((key) => {
      const acc = byDriver.get(key)!;
      const resultsArr = rounds.map((rd) => {
        const cell = acc.byRound.get(rd);
        if (!cell) return null; // did not participate that round
        if (!cell.finished) return "DNF" as const;
        return cell.position; // number
      });
      return { code: acc.code, team: acc.team, color: teamColor(acc.rawRef, season), results: resultsArr };
    });

    // Details map: details[driverCode][round] = { ...full detail }
    const details: Record<string, Record<number, Detail>> = {};
    for (const key of allKeys) {
      const acc = byDriver.get(key)!;
      const perRound: Record<number, Detail> = {};
      for (const rd of rounds) {
        const cell = acc.byRound.get(rd);
        if (!cell) continue;
        perRound[rd] = cell;
      }
      details[acc.code] = perRound;
    }

    return NextResponse.json(
      { mode: "drivers", calendar, drivers, details },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("[/api/results] query failed:", err);
    return NextResponse.json({ error: "Failed to load results." }, { status: 500 });
  }
}
