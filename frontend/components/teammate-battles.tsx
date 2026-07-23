"use client";

export type TeammateBattleSeason = {
  season: number;
  teammates: { name: string; races: number }[];
  team: string;
  teamColor: string;
  race: {
    driver: number;
    teammate: number;
  };
  qualifying: {
    driver: number;
    teammate: number;
  };
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.86)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.54)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.32)";
const DRIVER_BAR =
  "linear-gradient(90deg, rgba(174, 153, 255, 0.96), rgba(94, 76, 180, 0.72))";
const TEAMMATE_BAR = "rgba(199, 197, 208, 0.34)";

// Preview-only values. Replaced by the API response once teammate H2H is connected.
const HAMILTON_PREVIEW: TeammateBattleSeason[] = [
  { season: 2007, teammates: [{ name: "Alonso", races: 17 }], team: "McLaren", teamColor: "#EE3D42", race: { driver: 6, teammate: 9 }, qualifying: { driver: 9, teammate: 8 } },
  { season: 2013, teammates: [{ name: "Rosberg", races: 19 }], team: "Mercedes", teamColor: "#27F4D2", race: { driver: 7, teammate: 8 }, qualifying: { driver: 11, teammate: 8 } },
  { season: 2019, teammates: [{ name: "Bottas", races: 21 }], team: "Mercedes", teamColor: "#27F4D2", race: { driver: 13, teammate: 6 }, qualifying: { driver: 14, teammate: 7 } },
  { season: 2024, teammates: [{ name: "Russell", races: 24 }], team: "Mercedes", teamColor: "#27F4D2", race: { driver: 7, teammate: 13 }, qualifying: { driver: 5, teammate: 19 } },
  { season: 2025, teammates: [{ name: "Leclerc", races: 24 }], team: "Ferrari", teamColor: "#E8002D", race: { driver: 3, teammate: 18 }, qualifying: { driver: 5, teammate: 19 } },
];

type TeammateBattlesProps = {
  driverCode?: string;
  seasons?: TeammateBattleSeason[];
  loading?: boolean;
};

export function TeammateBattles({
  driverCode = "HAM",
  seasons = HAMILTON_PREVIEW,
  loading = false,
}: TeammateBattlesProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Teammate battles">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)] items-end gap-2 pb-1.5">
        <MetricHeader
          left={driverCode}
          title="Race H2H"
          right="TM"
          leftShift="translate-x-[4px]"
        />

        <span
          className="text-center text-[9px] font-semibold italic tracking-[0.22em]"
          style={{ color: TEXT_MUTED }}
        >
          SEASON
        </span>

        <MetricHeader
          left={driverCode}
          title="Qualifying H2H"
          right="TM"
          rightShift="-translate-x-[4px]"
        />
      </div>

      {loading ? (
        // Deliberately NOT the same gridTemplateRows trick used below for the
        // genuinely-empty case. That trick sets `repeat(Math.max(length, 1),
        // ...)` — with seasons.length===0 during loading, that's ONE row
        // filling the whole panel, which then fragments into however many
        // real rows arrive (a driver with 15 seasons goes from "one big
        // block" to "15 thin rows"), reading as a jump/snap. A loading state
        // that isn't trying to BE a data grid at all doesn't have that
        // problem — it just gets replaced by the real grid once data exists.
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <span className="text-[11px] italic" style={{ color: TEXT_MUTED }}>
            Loading…
          </span>
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 gap-y-[2px]"
          style={{
            gridTemplateRows: `repeat(${Math.max(seasons.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {seasons.length === 0 ? (
            <div className="flex items-center justify-center">
              <span className="text-[11px] italic" style={{ color: TEXT_MUTED }}>
                No teammate data available
              </span>
            </div>
          ) : (
            seasons.map((season, index) => (
              <SeasonBattleRow
                key={season.season}
                driverCode={driverCode}
                season={season}
                flipTooltip={index >= seasons.length - Math.ceil(seasons.length * 0.35)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MetricHeader({
  left,
  title,
  right,
  leftShift = "",
  rightShift = "",
}: {
  left: string;
  title: string;
  right: string;
  leftShift?: string;
  rightShift?: string;
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_24px] items-end gap-2">
      <span
        className={`text-center text-[8px] font-semibold ${leftShift}`}
        style={{ color: TEXT_MUTED }}
      >
        {left}
      </span>

      <span
        className="truncate text-center text-[9px] font-semibold italic tracking-[0.12em]"
        style={{ color: TEXT_SECONDARY }}
      >
        {title}
      </span>

      <span
        className={`text-center text-[8px] font-semibold ${rightShift}`}
        style={{ color: TEXT_MUTED }}
      >
        {right}
      </span>
    </div>
  );
}

function SeasonBattleRow({
  driverCode,
  season,
  flipTooltip = false,
}: {
  driverCode: string;
  season: TeammateBattleSeason;
  flipTooltip?: boolean;
}) {
  return (
    <div className="group relative grid min-h-0 grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)] items-center gap-2 rounded-[4px] px-1 transition-colors hover:bg-white/[0.035]">
      <HeadToHead value={season.race} />

      <div className="relative flex min-w-0 translate-x-[4px] items-center justify-center gap-1.5">
        <span
          aria-hidden="true"
          className="absolute left-[10px] h-[10px] w-[2px] rounded-full"
          style={{
            background: season.teamColor,
            boxShadow: `0 0 7px ${season.teamColor}55`,
          }}
        />

        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: TEXT_PRIMARY }}
        >
          {season.season}
        </span>

        <span
          className="text-[9px] font-semibold tracking-[0.08em]"
          style={{ color: TEXT_SECONDARY }}
        >
          TM
        </span>
      </div>

      <HeadToHead value={season.qualifying} />

      <div
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-20 w-max max-w-[240px] -translate-x-1/2 rounded-md border border-white/10 px-2.5 py-2 opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100 ${
          flipTooltip ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]"
        }`}
        style={{
          background: "rgba(12, 13, 32, 0.96)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <p
          className="text-[10px] font-semibold"
          style={{ color: "rgba(245, 244, 250, 0.98)" }}
        >
          {season.season} · {season.team}
        </p>

        <div className="mt-1.5 flex flex-col gap-0.5">
          {season.teammates.map((tm) => (
            <p
              key={tm.name}
              className="flex items-center justify-between gap-4 text-[9px]"
              style={{ color: TEXT_SECONDARY }}
            >
              <span style={{ color: "rgba(224, 222, 234, 0.92)" }}>{tm.name}</span>
              <span style={{ color: "rgba(199, 197, 208, 0.62)" }}>
                {tm.races} {tm.races === 1 ? "race" : "races"}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeadToHead({
  value,
}: {
  value: {
    driver: number;
    teammate: number;
  };
}) {
  const total = value.driver + value.teammate;
  const driverShare = total === 0 ? 0 : (value.driver / total) * 100;
  const teammateShare = total === 0 ? 0 : (value.teammate / total) * 100;

  return (
    <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-2">
      <Score value={value.driver} winner={value.driver > value.teammate} />

      <div className="flex min-w-0 items-center">
        <div className="relative h-[4px] min-w-0 flex-1 overflow-hidden rounded-l-full bg-white/[0.035]">
          <span
            className="absolute right-0 top-0 h-full rounded-l-full"
            style={{ width: `${driverShare}%`, background: DRIVER_BAR }}
          />
        </div>

        <span aria-hidden="true" className="mx-[3px] h-[11px] w-px bg-white/[0.20]" />

        <div className="relative h-[4px] min-w-0 flex-1 overflow-hidden rounded-r-full bg-white/[0.035]">
          <span
            className="absolute left-0 top-0 h-full rounded-r-full"
            style={{ width: `${teammateShare}%`, background: TEAMMATE_BAR }}
          />
        </div>
      </div>

      <Score value={value.teammate} winner={value.teammate > value.driver} />
    </div>
  );
}

function Score({ value, winner }: { value: number; winner: boolean }) {
  return (
    <span
      className="text-center text-[10px] font-semibold tabular-nums"
      style={{ color: winner ? TEXT_PRIMARY : TEXT_SECONDARY }}
    >
      {value}
    </span>
  );
}
