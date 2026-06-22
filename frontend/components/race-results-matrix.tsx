"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

// A cell is a finishing position (number), a DNF, or null (did not enter that round).
type ResultCell = number | "DNF" | null;

type CalendarGp = {
  round: number;
  code: string;
  name: string;
  country: string | null;
  countryCode?: string;
};

type ConCell = {
  best: number | "DNF" | null;
  second: number | "DNF" | null;
};

type DriverRow = {
  code: string;
  team: string | null;
  color: string;
  results: (ResultCell | ConCell)[];
};

type CellDetail = {
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

type ConDetail = {
  drivers: { code: string; position: number | "DNF" | null; points: number | null }[];
};

type ApiResponse = {
  mode?: "drivers" | "constructors";
  calendar: CalendarGp[];
  drivers: DriverRow[];
  // drivers-mode: CellDetail per code; constructors-mode: ConDetail per team key
  details: Record<string, Record<number, CellDetail | ConDetail>>;
};

// Type guard: is this a constructor cell (two halves)?
function isConCell(c: ResultCell | ConCell): c is ConCell {
  return c !== null && typeof c === "object";
}

type HoverState = {
  di: number;
  ri: number;
  x: number;
  y: number;
};

const LABEL = "rgba(255,255,255,0.4)";

function cellBg(p: ResultCell): string {
  if (p === null) return "transparent";
  if (p === "DNF") return "rgba(219, 86, 135, 0.42)";

  if (p === 1) return "rgba(203, 169, 86, 0.48)";
  if (p === 2) return "rgba(156, 164, 184, 0.40)";
  if (p === 3) return "rgba(154, 100, 65, 0.42)";

  if (p <= 10) return `rgba(130, 134, 168, ${0.28 - (p - 4) * 0.025})`;

  return "rgba(100, 100, 130, 0.12)";
}

function cellText(p: ResultCell): string {
  if (p === null) return "transparent";
  if (p === "DNF") return "rgba(255, 218, 235, 0.88)";

  if (p === 1) return "#f8e6a6";
  if (p === 2) return "#dfe4f2";
  if (p === 3) return "#e7bd9b";

  if (p <= 10) return "rgba(255, 255, 255, 0.62)";

  return "rgba(255, 255, 255, 0.34)";
}

export function RaceResultsMatrix({
  season = 2024,
  mode = "drivers",
}: {
  season?: number;
  mode?: "drivers" | "constructors";
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [tooltipRoot, setTooltipRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTooltipRoot(document.body);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setHover(null);

    fetch(`/api/results?season=${season}&mode=${mode}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[RaceResultsMatrix] fetch failed:", err);
        setError("Could not load results.");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [season, mode]);

  function handleCellHover(
    e: MouseEvent<HTMLDivElement>,
    di: number,
    ri: number
  ) {
    const tooltipWidth = 240;
    const tooltipHeight = 250;
    const offset = 14;
    const padding = 8;

    let x = e.clientX + offset;
    let y = e.clientY - tooltipHeight - offset;

    if (x + tooltipWidth > window.innerWidth - padding) {
      x = window.innerWidth - tooltipWidth - padding;
    }
    if (y < padding) y = padding;

    setHover({ di, ri, x: Math.max(padding, x), y: Math.max(padding, y) });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[11px] italic" style={{ color: LABEL }}>
          Loading…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[11px] italic" style={{ color: LABEL }}>
          {error ?? "No data."}
        </span>
      </div>
    );
  }

  const { calendar, drivers, details } = data;
  const isConstructors = data.mode === "constructors";

  // Resolve hovered cell detail from the loaded data (no extra request).
  const hoveredGp = hover ? calendar[hover.ri] : null;
  const hoveredDriver = hover ? drivers[hover.di] : null;

  // drivers-mode: look up by code; constructors-mode: look up by team key.
  const detail: CellDetail | null =
    !isConstructors && hover && hoveredGp && hoveredDriver
      ? ((details[hoveredDriver.code]?.[hoveredGp.round] as CellDetail) ?? null)
      : null;

  const conDetail: ConDetail | null =
    isConstructors && hover && hoveredGp && hoveredDriver && hoveredDriver.team
      ? ((details[hoveredDriver.team]?.[hoveredGp.round] as ConDetail) ?? null)
      : null;

  return (
    <div className="relative flex h-full flex-col">
      {/* Header: GP flags + codes */}
      <div className="-mt-1 flex">
        <div className="w-[32px] flex-shrink-0" />

        {calendar.map((gp, index) => (
          <div key={`${gp.code}-${index}`} className="flex-1 pb-1.5 text-center">
            <div className="flex h-[10px] items-center justify-center">
              {gp.countryCode ? (
                <img
                  src={`https://flagcdn.com/w20/${gp.countryCode}.png`}
                  alt={`${gp.country ?? gp.code} flag`}
                  loading="lazy"
                  className="h-[8px] w-[12px] rounded-[1px] object-cover opacity-80"
                />
              ) : (
                <span className="text-[8px] leading-none text-white/45">
                  {gp.code}
                </span>
              )}
            </div>

            <div
              className="mt-0.5 text-[8px] font-semibold tracking-wide"
              style={{ color: "#c7c5d0" }}
            >
              {gp.code}
            </div>
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-1 flex-col">
        {drivers.map((d, di) => (
          <div key={`${d.code}-${di}`} className="flex min-h-0 flex-1 items-stretch">
            <div className="flex w-[32px] flex-shrink-0 items-center">
              <span
                className="mr-1 inline-block h-2.5 w-0.5 rounded-[1px]"
                style={{ background: d.color || "transparent" }}
              />
              <span className="text-[9px] font-semibold" style={{ color: "#c7c5d0" }}>
                {d.code}
              </span>
            </div>

            {d.results.map((cell, i) => {
              // Constructor cell: two halves (best | second). Driver cell: single value.
              if (isConCell(cell)) {
                const hasSecond = cell.second !== null;
                return (
                  <div
                    key={i}
                    className="flex-1 cursor-default p-[1px]"
                    onMouseEnter={(e) => cell.best !== null && handleCellHover(e, di, i)}
                    onMouseMove={(e) => cell.best !== null && handleCellHover(e, di, i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className="flex h-full w-full gap-[1px]">
                      <div
                        className="flex flex-1 items-center justify-center rounded-l-[3px] font-semibold leading-none tabular-nums"
                        style={{
                          minHeight: 10,
                          background: cellBg(cell.best),
                          color: cellText(cell.best),
                          fontSize: 8,
                          borderRadius: hasSecond ? "5px 0 0 5px" : 5,
                        }}
                      >
                        {cell.best === "DNF" ? "R" : cell.best === null ? "" : cell.best}
                      </div>
                      {hasSecond && (
                        <div
                          className="flex flex-1 items-center justify-center font-semibold leading-none tabular-nums"
                          style={{
                            minHeight: 10,
                            background: cellBg(cell.second),
                            color: cellText(cell.second),
                            fontSize: 8,
                            borderRadius: "0 5px 5px 0",
                          }}
                        >
                          {cell.second === "DNF" ? "R" : cell.second}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Driver cell (single value)
              const pos = cell;
              return (
                <div
                  key={i}
                  className="flex-1 cursor-default p-[1px]"
                  onMouseEnter={(e) => pos !== null && handleCellHover(e, di, i)}
                  onMouseMove={(e) => pos !== null && handleCellHover(e, di, i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="flex h-full w-full items-center justify-center rounded-[5px] font-semibold leading-none tabular-nums transition-transform hover:scale-110"
                    style={{
                      minHeight: 10,
                      background: cellBg(pos),
                      color: cellText(pos),
                      fontSize: 8.5,
                    }}
                  >
                    {pos === "DNF" ? "R" : pos === null ? "" : pos}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {detail &&
        hover &&
        hoveredGp &&
        hoveredDriver &&
        tooltipRoot &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-[240px] rounded-xl border border-white/10 px-4 py-3 text-[11px]"
            style={{
              left: hover.x,
              top: hover.y,
              background: "rgba(12, 13, 32, 0.95)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <div>
                <div className="text-[13px] font-semibold text-white">
                  {hoveredGp.name}
                </div>
                <div className="text-[10px] text-white/50">
                  {hoveredGp.country} · Round {hoveredGp.round} · {hoveredDriver.code}
                </div>
              </div>

              {hoveredGp.countryCode && (
                <img
                  src={`https://flagcdn.com/w80/${hoveredGp.countryCode}.png`}
                  alt={`${hoveredGp.country} flag`}
                  loading="lazy"
                  className="h-[30px] w-[42px] flex-shrink-0 rounded-[4px] border border-white/10 object-cover opacity-95"
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {(() => {
                const finish = detail.finished ? detail.position : "DNF";
                const gain =
                  detail.finished &&
                  detail.position !== null &&
                  detail.grid !== null &&
                  detail.grid > 0
                    ? detail.grid - detail.position
                    : null;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Grid</span>
                      <span className="font-semibold tabular-nums text-white">
                        {detail.grid === 0 || detail.grid === null ? "PIT" : detail.grid}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Finish</span>
                      <span className="font-semibold tabular-nums text-white">
                        {finish === "DNF" ? "DNF" : finish ?? "—"}
                      </span>
                    </div>

                    {gain !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/50">Positions</span>
                        <span
                          className="font-semibold tabular-nums"
                          style={{
                            color:
                              gain > 0
                                ? "#4ade80"
                                : gain < 0
                                  ? "#f87171"
                                  : "rgba(255,255,255,0.7)",
                          }}
                        >
                          {gain > 0 ? "+" : ""}
                          {gain}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Gap</span>
                      <span className="font-semibold tabular-nums text-white">
                        {detail.gap ?? "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Points</span>
                      <span className="font-semibold tabular-nums text-white">
                        {detail.points !== null && detail.points > 0
                          ? detail.points
                          : "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Laps</span>
                      <span className="font-semibold tabular-nums text-white">
                        {detail.laps ?? "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Fastest lap</span>
                      <span className="flex items-center gap-1 font-semibold tabular-nums text-white">
                        {detail.isFastestLap && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: "#b86fff" }}
                            title="Fastest lap of the race"
                          />
                        )}
                        {detail.fastestLapTime ?? "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Status</span>
                      <span className="font-semibold text-white">{detail.status}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>,
          tooltipRoot
        )}

      {conDetail &&
        hover &&
        hoveredGp &&
        hoveredDriver &&
        tooltipRoot &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-[230px] rounded-xl border border-white/10 px-4 py-3 text-[11px]"
            style={{
              left: hover.x,
              top: hover.y,
              background: "rgba(12, 13, 32, 0.95)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <div>
                <div className="text-[13px] font-semibold text-white">
                  {hoveredGp.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                  <span
                    className="inline-block h-2 w-0.5 rounded-[1px]"
                    style={{ background: hoveredDriver.color || "transparent" }}
                  />
                  {hoveredDriver.code} · Round {hoveredGp.round}
                </div>
              </div>
              {hoveredGp.countryCode && (
                <img
                  src={`https://flagcdn.com/w80/${hoveredGp.countryCode}.png`}
                  alt={`${hoveredGp.country} flag`}
                  loading="lazy"
                  className="h-[30px] w-[42px] flex-shrink-0 rounded-[4px] border border-white/10 object-cover opacity-95"
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {conDetail.drivers.map((dr, idx) => (
                <div key={`${dr.code}-${idx}`} className="flex items-center justify-between gap-3">
                  <span className="text-white/80">{dr.code}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-white/60">
                      {dr.position === "DNF" ? "DNF" : dr.position === null ? "—" : `P${dr.position}`}
                    </span>
                    <span className="w-7 text-right font-semibold tabular-nums text-white">
                      {dr.points !== null && dr.points > 0 ? dr.points : "—"}
                    </span>
                  </div>
                </div>
              ))}

              <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5">
                <span className="text-white/50">Team points</span>
                <span className="font-semibold tabular-nums text-white">
                  {conDetail.drivers.reduce((s, dr) => s + (dr.points ?? 0), 0)}
                </span>
              </div>
            </div>
          </div>,
          tooltipRoot
        )}
    </div>
  );
}
