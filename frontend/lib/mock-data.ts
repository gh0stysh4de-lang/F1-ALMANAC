// Mock-дані сезону 2024 у формі, наближеній до майбутніх BigQuery-запитів.
// Коли підключимо BigQuery, ці структури замінить fetch до API — форма не зміниться.

export const TEAM_COLORS: Record<string, string> = {
  RedBull: "#3671C6",
  McLaren: "#FF8000",
  Ferrari: "#E8002D",
  Mercedes: "#27F4D2",
  Aston: "#229971",
  Alpine: "#0093CC",
  Williams: "#64C4FF",
  RB: "#6692FF",
  Haas: "#B6BABD",
  Sauber: "#52E252",
};

export type StandingRow = {
  name: string;
  team: keyof typeof TEAM_COLORS;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  wins: number;
  p2: number;
  p3: number;
};

function mk(
  name: string,
  team: keyof typeof TEAM_COLORS,
  points: number,
  w: number,
  p2: number,
  p3: number
): StandingRow {
  const gold = 25 * w;
  const silver = 18 * p2;
  const bronze = 15 * p3;
  return { name, team, points, gold, silver, bronze, wins: w, p2, p3 };
}

export const DRIVER_STANDINGS_2024: StandingRow[] = [
  mk("Verstappen", "RedBull", 437, 9, 4, 1),
  mk("Norris", "McLaren", 374, 4, 7, 3),
  mk("Leclerc", "Ferrari", 356, 3, 4, 6),
  mk("Piastri", "McLaren", 292, 2, 3, 3),
  mk("Sainz", "Ferrari", 290, 2, 3, 4),
  mk("Russell", "Mercedes", 245, 2, 1, 3),
  mk("Hamilton", "Mercedes", 223, 2, 1, 2),
  mk("Perez", "RedBull", 152, 0, 1, 3),
  mk("Alonso", "Aston", 70, 0, 0, 0),
  mk("Gasly", "Alpine", 42, 0, 0, 1),
  mk("Hulkenberg", "Haas", 41, 0, 0, 0),
  mk("Tsunoda", "RB", 30, 0, 0, 0),
  mk("Stroll", "Aston", 24, 0, 0, 0),
  mk("Ocon", "Alpine", 23, 0, 0, 1),
  mk("Magnussen", "Haas", 16, 0, 0, 0),
  mk("Albon", "Williams", 12, 0, 0, 0),
  mk("Ricciardo", "RB", 12, 0, 0, 0),
  mk("Bearman", "Ferrari", 7, 0, 0, 0),
  mk("Colapinto", "Williams", 5, 0, 0, 0),
  mk("Zhou", "Sauber", 4, 0, 0, 0),
];

export const CONSTRUCTOR_STANDINGS_2024: StandingRow[] = [
  mk("McLaren", "McLaren", 666, 6, 10, 6),
  mk("Ferrari", "Ferrari", 652, 5, 7, 10),
  mk("Red Bull", "RedBull", 589, 9, 5, 4),
  mk("Mercedes", "Mercedes", 468, 4, 2, 5),
  mk("Aston Martin", "Aston", 94, 0, 0, 0),
  mk("Alpine", "Alpine", 65, 0, 0, 2),
  mk("Haas", "Haas", 58, 0, 0, 0),
  mk("RB", "RB", 46, 0, 0, 0),
  mk("Williams", "Williams", 17, 0, 0, 0),
  mk("Sauber", "Sauber", 4, 0, 0, 0),
];

// --- Календар і результати гонок ---

export type RaceInfo = {
  code: string;
  flag: string;
  name: string;
  country: string;
};

export const CALENDAR_2024: RaceInfo[] = [
  { code: "BHR", flag: "🇧🇭", name: "Bahrain Grand Prix", country: "Bahrain" },
  { code: "SAU", flag: "🇸🇦", name: "Saudi Arabian Grand Prix", country: "Saudi Arabia" },
  { code: "AUS", flag: "🇦🇺", name: "Australian Grand Prix", country: "Australia" },
  { code: "JPN", flag: "🇯🇵", name: "Japanese Grand Prix", country: "Japan" },
  { code: "CHN", flag: "🇨🇳", name: "Chinese Grand Prix", country: "China" },
  { code: "MIA", flag: "🇺🇸", name: "Miami Grand Prix", country: "USA" },
  { code: "EMI", flag: "🇮🇹", name: "Emilia Romagna Grand Prix", country: "Italy" },
  { code: "MON", flag: "🇲🇨", name: "Monaco Grand Prix", country: "Monaco" },
  { code: "CAN", flag: "🇨🇦", name: "Canadian Grand Prix", country: "Canada" },
  { code: "ESP", flag: "🇪🇸", name: "Spanish Grand Prix", country: "Spain" },
  { code: "AUT", flag: "🇦🇹", name: "Austrian Grand Prix", country: "Austria" },
  { code: "GBR", flag: "🇬🇧", name: "British Grand Prix", country: "UK" },
  { code: "HUN", flag: "🇭🇺", name: "Hungarian Grand Prix", country: "Hungary" },
  { code: "BEL", flag: "🇧🇪", name: "Belgian Grand Prix", country: "Belgium" },
  { code: "NED", flag: "🇳🇱", name: "Dutch Grand Prix", country: "Netherlands" },
  { code: "ITA", flag: "🇮🇹", name: "Italian Grand Prix", country: "Italy" },
  { code: "AZE", flag: "🇦🇿", name: "Azerbaijan Grand Prix", country: "Azerbaijan" },
  { code: "SGP", flag: "🇸🇬", name: "Singapore Grand Prix", country: "Singapore" },
  { code: "USA", flag: "🇺🇸", name: "United States Grand Prix", country: "USA" },
  { code: "MEX", flag: "🇲🇽", name: "Mexico City Grand Prix", country: "Mexico" },
  { code: "BRA", flag: "🇧🇷", name: "São Paulo Grand Prix", country: "Brazil" },
  { code: "LVG", flag: "🇺🇸", name: "Las Vegas Grand Prix", country: "USA" },
  { code: "QAT", flag: "🇶🇦", name: "Qatar Grand Prix", country: "Qatar" },
  { code: "ABU", flag: "🇦🇪", name: "Abu Dhabi Grand Prix", country: "UAE" },
];

export type ResultCell = number | "DNF";

export type DriverResults = {
  code: string;
  team: keyof typeof TEAM_COLORS;
  results: ResultCell[];
};

export const DRIVER_RACE_RESULTS_2024: DriverResults[] = [
  { code: "VER", team: "RedBull",  results: [1,1,1,1,1,1,1,6,1,2,"DNF",1,5,1,2,1,5,2,1,1,1,1,1,1] },
  { code: "NOR", team: "McLaren",  results: [2,7,6,2,4,1,2,4,6,1,1,3,2,3,2,3,4,1,3,2,"DNF",1,3,4] },
  { code: "LEC", team: "Ferrari",  results: ["DNF",2,3,3,4,3,3,1,5,3,4,5,1,"DNF",6,2,2,4,4,4,3,4,2,3] },
  { code: "PIA", team: "McLaren",  results: [3,5,2,"DNF",5,2,4,3,2,5,3,4,3,4,4,4,3,3,2,3,2,3,5,2] },
  { code: "SAI", team: "Ferrari",  results: [4,3,4,4,3,4,6,2,4,4,5,2,6,2,1,5,1,5,5,5,4,2,4,5] },
  { code: "RUS", team: "Mercedes", results: [5,6,5,6,2,5,5,5,3,6,6,1,4,5,3,6,8,6,1,6,5,5,6,7] },
  { code: "HAM", team: "Mercedes", results: [7,9,9,9,9,6,1,7,7,1,4,2,8,6,8,7,9,7,6,7,3,6,8,6] },
  { code: "PER", team: "RedBull",  results: [6,4,5,2,8,3,8,16,5,8,7,17,7,7,5,8,6,10,8,"DNF",11,8,9,10] },
  { code: "ALO", team: "Aston",    results: [8,8,7,8,6,9,7,9,8,7,8,7,9,8,9,10,7,8,7,8,6,10,10,8] },
  { code: "GAS", team: "Alpine",   results: [11,10,10,11,"DNF",8,10,8,11,10,12,8,10,9,10,9,10,9,9,9,8,7,7,11] },
  { code: "HUL", team: "Haas",     results: [10,14,8,10,7,10,9,11,10,9,10,10,12,10,7,11,11,11,10,10,7,9,11,9] },
  { code: "TSU", team: "RB",       results: [14,11,11,7,10,11,11,10,14,11,9,6,11,12,11,13,"DNF",12,12,12,10,12,12,12] },
  { code: "STR", team: "Aston",    results: [12,12,13,12,11,12,12,14,12,12,11,11,14,11,13,14,12,14,13,13,9,13,14,14] },
  { code: "OCO", team: "Alpine",   results: [9,13,12,14,12,7,14,12,9,14,"DNF",9,13,13,12,12,14,13,11,11,12,11,13,13] },
  { code: "MAG", team: "Haas",     results: [13,16,14,13,13,14,13,13,13,13,13,12,"DNF",14,14,15,13,15,14,14,13,14,15,15] },
  { code: "ALB", team: "Williams", results: [15,15,16,15,14,13,15,15,16,15,15,14,15,16,15,16,15,16,15,15,14,15,16,16] },
  { code: "RIC", team: "RB",       results: [16,17,15,16,15,15,16,18,15,16,14,13,16,15,16,17,16,17,16,16,15,16,17,17] },
  { code: "BEA", team: "Ferrari",  results: [17,18,18,5,16,18,18,17,17,17,16,16,17,18,18,18,17,18,18,17,17,17,18,18] },
  { code: "COL", team: "Williams", results: [18,19,19,18,17,16,17,19,18,18,17,18,18,17,17,19,18,19,17,18,16,18,19,19] },
  { code: "ZHO", team: "Sauber",   results: [19,20,17,17,18,17,19,20,19,19,18,15,19,19,19,20,19,20,"DNF",19,18,19,20,20] },
];

// --- Траєкторія накопичених очок (топ-5) для Cumulative Dynamics ---

export type TrajectoryDriver = {
  code: string;
  team: keyof typeof TEAM_COLORS;
  primary: boolean;
  cumulative: number[];
};

function cumFromResults(results: ResultCell[]): number[] {
  const pts: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
  };
  let total = 0;
  return results.map((p) => {
    total += p === "DNF" ? 0 : pts[p] ?? 0;
    return total;
  });
}

export const TRAJECTORY_2024: TrajectoryDriver[] = DRIVER_RACE_RESULTS_2024
  .slice(0, 5)
  .map((d) => {
    const firstOfTeam =
      DRIVER_RACE_RESULTS_2024.findIndex((x) => x.team === d.team);
    const myIndex = DRIVER_RACE_RESULTS_2024.findIndex((x) => x.code === d.code);
    return {
      code: d.code,
      team: d.team,
      primary: firstOfTeam === myIndex,
      cumulative: cumFromResults(d.results),
    };
  });

// --- Подіуми: гонки + спринти (для блоку Podiums) ---

export type PodiumRow = {
  name: string;
  team: keyof typeof TEAM_COLORS;
  raceW: number;
  raceP2: number;
  raceP3: number;
  sprW: number;
  sprP2: number;
  sprP3: number;
};

export const PODIUMS_2024: PodiumRow[] = [
  { name: "Verstappen", team: "RedBull",  raceW: 9, raceP2: 4, raceP3: 1, sprW: 4, sprP2: 1, sprP3: 0 },
  { name: "Norris",     team: "McLaren",  raceW: 4, raceP2: 7, raceP3: 3, sprW: 1, sprP2: 2, sprP3: 1 },
  { name: "Leclerc",    team: "Ferrari",  raceW: 3, raceP2: 4, raceP3: 6, sprW: 0, sprP2: 1, sprP3: 1 },
  { name: "Piastri",    team: "McLaren",  raceW: 2, raceP2: 3, raceP3: 3, sprW: 1, sprP2: 0, sprP3: 2 },
  { name: "Sainz",      team: "Ferrari",  raceW: 2, raceP2: 3, raceP3: 4, sprW: 0, sprP2: 0, sprP3: 1 },
  { name: "Russell",    team: "Mercedes", raceW: 2, raceP2: 1, raceP3: 3, sprW: 0, sprP2: 1, sprP3: 0 },
  { name: "Hamilton",   team: "Mercedes", raceW: 2, raceP2: 1, raceP3: 2, sprW: 0, sprP2: 0, sprP3: 1 },
  { name: "Perez",      team: "RedBull",  raceW: 0, raceP2: 1, raceP3: 3, sprW: 0, sprP2: 0, sprP3: 0 },
];

// --- Деталі для тултіпа матриці ---

export type CellDetail = {
  raceName: string;
  country: string;
  round: number;
  finish: number | "DNF";
  grid: number;
  status: string;
};

function gridFromFinish(finish: ResultCell, seed: number): number {
  if (finish === "DNF") return ((seed * 7) % 18) + 1;
  const delta = ((seed * 13) % 7) - 3;
  return Math.max(1, Math.min(20, finish + delta));
}

function statusFromFinish(finish: ResultCell, seed: number): string {
  if (finish === "DNF") {
    const reasons = ["Accident", "Engine", "Collision", "Gearbox", "Hydraulics"];
    return reasons[seed % reasons.length];
  }
  if (finish >= 11 && seed % 3 === 0) return "+1 Lap";
  return "Finished";
}

export function getCellDetail(
  driverIndex: number,
  raceIndex: number
): CellDetail | null {
  const driver = DRIVER_RACE_RESULTS_2024[driverIndex];
  const race = CALENDAR_2024[raceIndex];
  if (!driver || !race) return null;
  const finish = driver.results[raceIndex];
  const seed = driverIndex * 31 + raceIndex * 7 + 3;
  return {
    raceName: race.name,
    country: race.country,
    round: raceIndex + 1,
    finish,
    grid: gridFromFinish(finish, seed),
    status: statusFromFinish(finish, seed),
  };
}