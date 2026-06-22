"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "rgba(203, 169, 86, 0.9)";
const SILVER = "rgba(156, 164, 184, 0.9)";
const BRONZE = "rgba(154, 100, 65, 0.9)";

const NAME = "#c7c5d0";
const ACTIVE_MODE = "rgba(199, 197, 208, 0.9)";
const LABEL = "rgba(255,255,255,0.4)";

type Mode = "race" | "sprint";

type PodiumRow = {
  name: string;
  team: string | null;
  color: string;
  raceW: number;
  raceP2: number;
  raceP3: number;
  sprW: number;
  sprP2: number;
  sprP3: number;
};

type ApiResponse = {
  rounds: number[];
  trajectory: unknown[];
  podiums: PodiumRow[];
};

function getPodiumValues(d: PodiumRow, mode: Mode) {
  if (mode === "race") {
    return [
      { v: d.raceW, c: GOLD },
      { v: d.raceP2, c: SILVER },
      { v: d.raceP3, c: BRONZE },
    ];
  }
  return [
    { v: d.sprW, c: GOLD },
    { v: d.sprP2, c: SILVER },
    { v: d.sprP3, c: BRONZE },
  ];
}

export function PodiumsTable({
  season = 2024,
  entity = "drivers",
}: {
  season?: number;
  entity?: "drivers" | "constructors";
}) {
  const [allRows, setAllRows] = useState<PodiumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("race");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/momentum?season=${season}&mode=${entity}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        setAllRows(json.podiums ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[PodiumsTable] fetch failed:", err);
        setError("Could not load podiums.");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [season, entity]);

  // Does this season have any sprint podiums at all? (Sprints exist only from 2021.)
  const hasSprint = allRows.some(
    (r) => r.sprW > 0 || r.sprP2 > 0 || r.sprP3 > 0
  );
  // Effective mode: never show the sprint view when there are no sprints.
  const effectiveMode: Mode = hasSprint ? mode : "race";

  const podiumDrivers = useMemo(() => {
    return allRows
      .filter((d) => {
        const values = getPodiumValues(d, effectiveMode);
        return values.some((item) => item.v > 0);
      })
      .sort((a, b) => {
        const [aw, as, ab] = getPodiumValues(a, effectiveMode).map((x) => x.v);
        const [bw, bs, bb] = getPodiumValues(b, effectiveMode).map((x) => x.v);
        const aTotal = aw + as + ab;
        const bTotal = bw + bs + bb;
        // 1) total podiums, 2) wins, 3) silver, 4) bronze (final tiebreak)
        return bTotal - aTotal || bw - aw || bs - as || bb - ab;
      });
  }, [allRows, effectiveMode]);

  const maxV = Math.max(
    1,
    ...podiumDrivers.flatMap((d) =>
      getPodiumValues(d, effectiveMode).map((item) => item.v)
    )
  );

  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[11px] italic" style={{ color: LABEL }}>
          {error ?? "Loading…"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* small switcher — only when the season actually has sprints */}
      {hasSprint && (
        <div className="absolute right-0 top-[-22px] flex items-center gap-1.5">
        <span
          className="text-[7px] font-semibold uppercase tracking-[0.08em]"
          style={{
            color: mode === "race" ? ACTIVE_MODE : "rgba(255,255,255,0.24)",
          }}
        >
          Race
        </span>

        <button
          type="button"
          onClick={() => setMode(mode === "race" ? "sprint" : "race")}
          className="relative h-[13px] w-[25px] rounded-full border border-white/[0.08] bg-white/[0.05] transition"
          aria-label="Toggle podium mode"
        >
          <span
            className="absolute top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full transition-all"
            style={{
              left: mode === "race" ? 2 : 13,
              background: "rgba(156, 164, 184, 0.70)",
              boxShadow: "0 0 8px rgba(156,164,184,0.16)",
            }}
          />
        </button>

        <span
          className="text-[7px] font-semibold uppercase tracking-[0.08em]"
          style={{
            color: mode === "sprint" ? ACTIVE_MODE : "rgba(255,255,255,0.24)",
          }}
        >
          Sprint
        </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-stretch pt-1">
        {podiumDrivers.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[10px] italic" style={{ color: LABEL }}>
              No {effectiveMode} podiums this season
            </span>
          </div>
        ) : (
          podiumDrivers.map((d, idx) => {
            const bars = getPodiumValues(d, effectiveMode);
            const totalPodiums = bars.reduce((sum, item) => sum + item.v, 0);

            return (
              <div
                key={`${d.name}-${idx}`}
                className="flex min-w-0 flex-1 flex-col"
                style={{
                  borderRight:
                    idx < podiumDrivers.length - 1
                      ? "0.5px solid rgba(255,255,255,0.035)"
                      : "none",
                }}
              >
                {/* total podiums */}
                <div className="flex h-[20px] items-center justify-center">
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: NAME }}
                  >
                    {totalPodiums}
                  </span>
                </div>

                {/* bars */}
                <div className="flex min-h-0 flex-1 items-end justify-center gap-[3px] px-1 pb-2 pt-2">
                  {bars.map((bar, i) => (
                    <div
                      key={i}
                      className="flex h-full w-[7px] flex-col items-center justify-end"
                    >
                      {bar.v > 0 && (
                        <span className="mb-0.5 text-[8px] font-semibold italic text-white/35">
                          {bar.v}
                        </span>
                      )}

                      <div
                        className="w-full rounded-t-[2px]"
                        style={{
                          height: `${(bar.v / maxV) * 100}%`,
                          minHeight: bar.v > 0 ? 3 : 0,
                          background: bar.c,
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* code + team stripe */}
                <div className="flex items-center justify-center gap-1 border-t border-white/[0.06] pb-1.5 pt-1.5">
                  <span
                    className="h-2 w-0.5 rounded-[1px]"
                    style={{ background: d.color || "transparent" }}
                  />

                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: NAME }}
                  >
                    {d.name.slice(0, 3).toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
