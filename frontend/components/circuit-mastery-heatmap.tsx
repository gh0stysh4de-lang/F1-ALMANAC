export type CircuitStat = {
  rank: number;
  name: string;
  countryCode: string;
  country: string;
  mastery: number;
  starts: number;

  raceWins: number;
  racePodiums: number;
  racePoles: number;

  sprintWins: number | null;
  sprintPodiums: number | null;
  sprintPoles: number | null;
};

const TEXT_PRIMARY = "#c7c5d0";
const TEXT_MUTED = "rgba(199, 197, 208, 0.48)";
const TEXT_PLACEHOLDER = "rgba(181, 179, 190, 0.66)";

const CIRCUITS: CircuitStat[] = [
  {
    rank: 1,
    name: "Silverstone",
    countryCode: "gb",
    country: "GBR",
    mastery: 58.7,
    starts: 20,
    raceWins: 9,
    racePodiums: 15,
    racePoles: 8,
    sprintWins: 0,
    sprintPodiums: null,
    sprintPoles: null,
  },
  {
    rank: 2,
    name: "Hungaroring",
    countryCode: "hu",
    country: "HUN",
    mastery: 52.6,
    starts: 19,
    raceWins: 8,
    racePodiums: 12,
    racePoles: 8,
    sprintWins: null,
    sprintPodiums: null,
    sprintPoles: null,
  },
  {
    rank: 3,
    name: "Barcelona",
    countryCode: "es",
    country: "ESP",
    mastery: 51.1,
    starts: 20,
    raceWins: 7,
    racePodiums: 13,
    racePoles: 7,
    sprintWins: null,
    sprintPodiums: null,
    sprintPoles: null,
  },
  {
    rank: 4,
    name: "Shanghai",
    countryCode: "cn",
    country: "CHN",
    mastery: 50.6,
    starts: 16,
    raceWins: 6,
    racePodiums: 10,
    racePoles: 6,
    sprintWins: 1,
    sprintPodiums: null,
    sprintPoles: null,
  },
  {
    rank: 5,
    name: "Montréal",
    countryCode: "ca",
    country: "CAN",
    mastery: 49,
    starts: 17,
    raceWins: 7,
    racePodiums: 11,
    racePoles: 6,
    sprintWins: null,
    sprintPodiums: null,
    sprintPoles: null,
  },
];

function StatValue({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const isPlaceholder = value === null;

  return (
    <div
      title={label}
      className="flex h-full min-w-0 items-center justify-center"
    >
      <span
        className={`flex h-full items-center justify-center leading-none ${
          isPlaceholder
            ? "text-[11px] font-medium"
            : "text-[13px] font-semibold"
        }`}
        style={{
          color: isPlaceholder ? TEXT_PLACEHOLDER : TEXT_PRIMARY,
        }}
      >
        {isPlaceholder ? "—" : value}
      </span>
    </div>
  );
}

function StatColumnLabels() {
  return (
    <div className="relative top-[6px] grid grid-cols-3">
      <span
        className="flex items-center justify-center text-[7px] font-medium italic leading-none"
        style={{ color: TEXT_MUTED }}
      >
        Wins
      </span>

      <span
        className="flex items-center justify-center text-[7px] font-medium italic leading-none"
        style={{ color: TEXT_MUTED }}
      >
        Podiums
      </span>

      <span
        className="flex items-center justify-center text-[7px] font-medium italic leading-none"
        style={{ color: TEXT_MUTED }}
      >
        Poles
      </span>
    </div>
  );
}

function CircuitInfo({
  circuit,
  strongestMastery,
}: {
  circuit: CircuitStat;
  strongestMastery: number;
}) {
  const relativeStrength =
    strongestMastery > 0
      ? (circuit.mastery / strongestMastery) * 100
      : 0;

  return (
    <div className="flex h-full min-w-0 flex-col justify-center pr-[7px]">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="w-4 shrink-0 text-[10px] font-semibold"
          style={{ color: TEXT_MUTED }}
        >
          #{circuit.rank}
        </span>

        <img
          src={`https://flagcdn.com/w20/${circuit.countryCode}.png`}
          alt={`${circuit.country} flag`}
          className="h-[10px] w-[15px] shrink-0 rounded-[1px] object-cover opacity-85"
        />

        <span
          className="truncate text-[12px] font-semibold"
          style={{ color: TEXT_PRIMARY }}
        >
          {circuit.name}
        </span>

        <span
          className="shrink-0 text-[9px] italic"
          style={{ color: TEXT_MUTED }}
        >
          {circuit.country}
        </span>
      </div>

      <div className="relative -top-2 mt-1.5 flex min-w-0 items-center gap-2">
        <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-black/[0.28]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${relativeStrength}%`,
              background:
                "linear-gradient(90deg, rgba(94, 76, 180, 0.60), rgba(174, 153, 255, 0.82))",
              boxShadow: "0 0 8px rgba(151, 128, 255, 0.14)",
            }}
          />
        </div>

        <div className="w-[46px] shrink-0 text-right">
          <span
            className="block text-[13px] font-semibold leading-none"
            style={{ color: TEXT_PRIMARY }}
          >
            {circuit.mastery.toFixed(1)}%
          </span>

          <span
            className="mt-0.5 block text-[8px] italic leading-none"
            style={{ color: TEXT_MUTED }}
          >
            {circuit.starts} starts
          </span>
        </div>
      </div>
    </div>
  );
}

function CircuitStats({ circuit }: { circuit: CircuitStat }) {
  return (
    <div className="grid h-full grid-cols-2">
      <div className="grid grid-cols-3">
        <StatValue value={circuit.raceWins} label="Race wins" />
        <StatValue value={circuit.racePodiums} label="Race podiums" />
        <StatValue value={circuit.racePoles} label="Race poles" />
      </div>

      <div className="grid grid-cols-3">
        <StatValue value={circuit.sprintWins} label="Sprint wins" />
        <StatValue value={circuit.sprintPodiums} label="Sprint podiums" />
        <StatValue value={circuit.sprintPoles} label="Sprint poles" />
      </div>
    </div>
  );
}

function CircuitRow({
  circuit,
  strongestMastery,
}: {
  circuit: CircuitStat;
  strongestMastery: number;
}) {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] gap-3">
      <CircuitInfo
        circuit={circuit}
        strongestMastery={strongestMastery}
      />

      <div className="relative left-[3px]">
        <CircuitStats circuit={circuit} />
      </div>
    </div>
  );
}

function StatsGlassPanel() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-22px] left-[57%] right-[-8px] h-[14px]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0.22), transparent)",
          filter: "blur(4px)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-8px] left-[57%] right-[-8px] top-[18px] overflow-hidden rounded-[10px]"
        style={{
          background: "transparent",
          border: "0.5px solid rgba(255, 255, 255, 0.085)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.045)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent 14%, rgba(160, 120, 240, 0.07) 34%, rgba(255, 255, 255, 0.045) 50%, rgba(160, 120, 240, 0.07) 66%, transparent 86%)",
          }}
        />

        <div
          className="absolute bottom-[12px] left-1/2 top-[8px] w-px -translate-x-1/2"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(191, 177, 235, 0.10) 9%, rgba(191, 177, 235, 0.24) 40%, rgba(191, 177, 235, 0.24) 60%, rgba(191, 177, 235, 0.10) 91%, transparent 100%)",
            boxShadow: "0 0 8px rgba(151, 128, 255, 0.08)",
          }}
        />
      </div>
    </>
  );
}

export function CircuitMasteryHeatmap({
  circuits = CIRCUITS,
  loading = false,
}: {
  circuits?: CircuitStat[];
  loading?: boolean;
}) {
  const strongestMastery =
    circuits.length > 0
      ? Math.max(...circuits.map((circuit) => circuit.mastery))
      : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <StatsGlassPanel />

      <div className="relative z-10 grid h-[39px] grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] gap-3">
        <div className="relative -top-[4px] flex items-start justify-center pt-[1px]">
          <span
            className="text-[10px] font-medium italic"
            style={{ color: TEXT_MUTED }}
          >
            Most Successful Circuits
          </span>
        </div>

        <div className="relative left-[3px] grid h-full grid-rows-[18px_1fr]">
          <div className="grid grid-cols-2">
            <div className="relative -top-[4px] flex items-center justify-center">
              <span
                className="text-[10px] font-medium italic"
                style={{ color: TEXT_MUTED }}
              >
                Race
              </span>
            </div>

            <div className="relative -top-[4px] flex items-center justify-center">
              <span
                className="text-[10px] font-medium italic"
                style={{ color: TEXT_MUTED }}
              >
                Sprint
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <StatColumnLabels />
            <StatColumnLabels />
          </div>
        </div>
      </div>

      <div className="relative z-10 -top-[7px] mt-1 grid min-h-0 flex-1 grid-rows-5 gap-2">
        {loading ? (
          <div className="col-span-full flex items-center justify-center">
            <span className="text-[11px] italic" style={{ color: TEXT_MUTED }}>
              Loading…
            </span>
          </div>
        ) : (
          circuits.map((circuit) => (
            <CircuitRow
              key={circuit.name}
              circuit={circuit}
              strongestMastery={strongestMastery}
            />
          ))
        )}
      </div>
    </div>
  );
}