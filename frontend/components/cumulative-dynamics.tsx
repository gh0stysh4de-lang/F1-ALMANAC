"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Tooltip,
  ReferenceLine,
} from "recharts";

type TrajectoryDriver = {
  code: string;
  team: string | null;
  color: string;
  primary: boolean;
  cumulative: number[];
};

type ApiResponse = {
  rounds: number[];
  trajectory: TrajectoryDriver[];
  podiums: unknown[];
};

const LABEL = "rgba(255,255,255,0.4)";

type TooltipProps = {
  active?: boolean;
  label?: number | string;
  payload?: { dataKey: string; value: number }[];
  tooltipRoot?: HTMLElement | null;
  mousePosition?: { x: number; y: number } | null;
  trajectory?: TrajectoryDriver[];
};

function ChartTooltip({
  active,
  label,
  payload,
  tooltipRoot,
  mousePosition,
  trajectory = [],
}: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  if (!tooltipRoot || !mousePosition) return null;

  const tooltipWidth = 170;
  const tooltipHeight = 145;
  const offset = 14;
  const padding = 8;

  let x = mousePosition.x + offset;
  let y = mousePosition.y - tooltipHeight - offset;

  if (x + tooltipWidth > window.innerWidth - padding) {
    x = window.innerWidth - tooltipWidth - padding;
  }
  if (y < padding) y = padding;

  const seen = new Set<string>();
  const rows = [...payload]
    .filter((r) => {
      if (seen.has(r.dataKey)) return false;
      seen.add(r.dataKey);
      return true;
    })
    .sort((a, b) => b.value - a.value);

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] w-[170px] rounded-lg border border-white/10 px-3 py-2 text-[11px]"
      style={{
        left: Math.max(padding, x),
        top: Math.max(padding, y),
        background: "rgba(12, 13, 32, 0.92)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
      }}
    >
      <div className="mb-1.5 text-center font-semibold text-white/50">
        Round {label}
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((r, idx) => {
          const d = trajectory.find((x) => x.code === r.dataKey);
          const color = d && d.color ? d.color : "#fff";
          const isPrimary = d?.primary;

          return (
            <div
              key={`${r.dataKey}-${idx}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-2.5 w-4 items-center">
                  <span
                    className="block w-full"
                    style={{
                      borderTop: `2px ${isPrimary ? "solid" : "dashed"} ${color}`,
                    }}
                  />
                </span>
                <span className="text-white/80">{r.dataKey}</span>
              </div>
              <span className="font-semibold tabular-nums text-white">
                {r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>,
    tooltipRoot
  );
}

// Build a "nice" Y-axis max + 2 ticks from the leader's final total.
// Rounds up to a clean step (¼ / ½ / 1 of the order of magnitude) so the ceiling
// sits just above the real max regardless of the era's points system, keeping the
// lines filling the chart height (e.g. 397 -> 400, 148 -> 150, 98 -> 100).
function yAxisFromMax(maxValue: number): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: 10, ticks: [5, 10] };
  const padded = maxValue * 1.005; // minimal headroom
  const mag = Math.pow(10, Math.floor(Math.log10(padded)));
  const norm = padded / mag; // 1..10
  let stepUnit: number;
  if (norm <= 2) stepUnit = mag / 4; // e.g. 100–200 -> step 25
  else stepUnit = mag / 2; // 200–1000 -> step 50 (covers constructors' larger totals)
  const niceMax = Math.ceil(padded / stepUnit) * stepUnit;
  return {
    max: niceMax,
    ticks: [Math.round(niceMax / 2), Math.round(niceMax)],
  };
}

export function CumulativeDynamics({
  season = 2024,
  mode = "drivers",
}: {
  season?: number;
  mode?: "drivers" | "constructors";
}) {
  const [trajectory, setTrajectory] = useState<TrajectoryDriver[]>([]);
  const [rounds, setRounds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tooltipRoot, setTooltipRoot] = useState<HTMLElement | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setTooltipRoot(document.body);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/momentum?season=${season}&mode=${mode}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        setTrajectory(json.trajectory ?? []);
        setRounds(json.rounds ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[CumulativeDynamics] fetch failed:", err);
        setError("Could not load momentum.");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [season, mode]);

  function handleChartMouseMove(e: MouseEvent<HTMLDivElement>) {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  if (loading || error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[11px] italic" style={{ color: LABEL }}>
          {error ?? "Loading…"}
        </span>
      </div>
    );
  }

  // No Constructors' Championship existed before 1958.
  if (trajectory.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <span className="text-[11px] italic leading-relaxed" style={{ color: LABEL }}>
          {mode === "constructors"
            ? "No Constructors' Championship before 1958"
            : "No data for this season"}
        </span>
      </div>
    );
  }

  // Assemble chart rows: one per round, each with every driver's cumulative value.
  const chartData = rounds.map((rd, i) => {
    const row: Record<string, number> = { round: rd };
    trajectory.forEach((d) => {
      row[d.code] = d.cumulative[i];
    });
    return row;
  });

  const leader = trajectory[0];
  const leaderMax = leader ? leader.cumulative[leader.cumulative.length - 1] ?? 0 : 0;
  const { max: yAxisMax, ticks: yAxisTicks } = yAxisFromMax(leaderMax);

  return (
    <div className="flex h-full flex-col">
      <style jsx global>{`
        .cumulative-chart-wrapper *:focus {
          outline: none !important;
        }
        .cumulative-chart-wrapper svg:focus {
          outline: none !important;
        }
      `}</style>

      <div
        className="cumulative-chart-wrapper min-h-0 flex-1 outline-none"
        onMouseMove={handleChartMouseMove}
        onMouseLeave={() => setMousePosition(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 16, right: 16, bottom: 4, left: 4 }}
          >
            <defs>
              <linearGradient id="leaderFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={leader && leader.color ? leader.color : "#8B7DF0"}
                  stopOpacity={0.25}
                />
                <stop
                  offset="100%"
                  stopColor={leader && leader.color ? leader.color : "#8B7DF0"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="round"
              tick={{
                fill: "rgba(255,255,255,0.35)",
                fontSize: 10,
                fontStyle: "italic",
              }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              interval={2}
            />

            <YAxis
              tick={{
                fill: "rgba(255,255,255,0.35)",
                fontSize: 10,
                fontStyle: "italic",
              }}
              tickLine={false}
              axisLine={false}
              ticks={yAxisTicks}
              domain={[0, yAxisMax]}
              width={32}
            />

            {yAxisTicks.map((tick) => (
              <ReferenceLine
                key={tick}
                y={tick}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="3 3"
              />
            ))}

            <Tooltip
              content={
                <ChartTooltip
                  tooltipRoot={tooltipRoot}
                  mousePosition={mousePosition}
                  trajectory={trajectory}
                />
              }
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            />

            {leader && (
              <Area
                type="monotone"
                dataKey={leader.code}
                stroke="none"
                fill="url(#leaderFill)"
                isAnimationActive={false}
              />
            )}

            {trajectory.map((d, di) => (
              <Line
                key={`${d.code}-${di}`}
                type="monotone"
                dataKey={d.code}
                stroke={d.color || "#fff"}
                strokeWidth={2}
                strokeDasharray={d.primary ? undefined : "5 4"}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
