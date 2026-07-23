"use client";

import { useEffect, useState } from "react";
import { teamColor } from "@/lib/team-colors";

// Vertical "most successful here" block: rank, driver, team colour stripe,
// then wins / podiums / sprint wins as count + percentage, with poles as a
// plain count (no percentage requested for poles).
//
// Percentages use different denominators on purpose:
//   win% / podium%   — of races started AT THIS CIRCUIT
//   sprint win%       — of sprints started at this circuit, not races. A
//                       driver can have 15 race starts here and exactly one
//                       sprint start; dividing that one win by 15 would read
//                       as 7% instead of the correct 100%.
// See app/api/circuit-top-drivers/route.ts for the query this renders.

type DriverRow = {
  driverId: number;
  code: string;
  name: string;
  constructorRef: string | null;
  lastYear: number | null;
  starts: number;
  wins: number;
  winPct: number | null;
  podiums: number;
  podiumPct: number | null;
  poles: number;
  // null = the driver never started a sprint here (format didn't exist for
  // them at this circuit) -> renders as "—". 0 = they started sprints and
  // won none -> renders as "0".
  sprintWins: number | null;
  sprintWinPct: number | null;
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.88)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.48)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const RANK_COLOR = "rgba(199, 197, 208, 0.40)";

export function CircuitTopDrivers({ circuitId }: { circuitId: number | null }) {
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (circuitId === null) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/circuit-top-drivers?id=${circuitId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDrivers(d.drivers ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDrivers([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: TEXT_MUTED }}>
        Loading…
      </div>
    );
  }

  if (!drivers || drivers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: TEXT_MUTED }}>
        No results at this circuit yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2.5">
      {drivers.map((d, i) => (
        <DriverRow key={d.driverId} rank={i + 1} driver={d} />
      ))}
    </div>
  );
}

function DriverRow({ rank, driver }: { rank: number; driver: DriverRow }) {
  const color = teamColor(driver.constructorRef, driver.lastYear ?? undefined);

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-2.5 py-2"
      style={{ background: "rgba(255,255,255,0.025)" }}
    >
      <span
        className="w-4 shrink-0 text-center text-[12px] font-semibold italic"
        style={{ color: RANK_COLOR }}
      >
        {rank}
      </span>

      <span
        className="h-8 w-[3px] shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />

      <span className="w-[132px] shrink-0 min-w-0">
        <span
          className="block truncate text-[13px] font-medium leading-tight"
          style={{ color: TEXT_PRIMARY }}
        >
          {driver.name}
        </span>
        <span className="block text-[10px] tracking-wide" style={{ color: TEXT_MUTED }}>
          {driver.starts} {driver.starts === 1 ? "start" : "starts"}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-4">
        <Stat label="Wins" value={driver.wins} pct={driver.winPct} />
        <Stat label="Podiums" value={driver.podiums} pct={driver.podiumPct} />
        <Stat label="Poles" value={driver.poles} pct={null} />
        <Stat label="Sprint W" value={driver.sprintWins} pct={driver.sprintWinPct} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  pct,
}: {
  label: string;
  value: number | null;
  pct: number | null;
}) {
  return (
    <div className="flex w-[54px] shrink-0 flex-col items-end">
      <span className="text-[13px] font-semibold leading-none" style={{ color: TEXT_PRIMARY }}>
        {value === null ? "\u2014" : value}
      </span>
      <span className="mt-1 text-[10px] leading-none" style={{ color: TEXT_SECONDARY }}>
        {pct === null ? label : `${pct}% \u00b7 ${label}`}
      </span>
    </div>
  );
}
