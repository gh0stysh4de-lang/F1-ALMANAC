"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { teamColor } from "@/lib/team-colors";

const GOLD = "rgba(203, 169, 86, 0.95)";
const SILVER = "rgba(156, 164, 184, 0.92)";
const BRONZE = "rgba(154, 100, 65, 0.95)";

const MEDAL: Record<number, string> = {
  1: GOLD,
  2: SILVER,
  3: BRONZE,
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(215, 212, 225, 0.62)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const CELL_BACKGROUND = "rgba(255,255,255,0.025)";
const CELL_BORDER = "rgba(255,255,255,0.055)";

type PodiumEntry = {
  position: number;
  driverId: number;
  name: string;
  constructorRef: string;
  team: string;
};

type YearEntry = {
  year: number;
  raceName: string;
  podium: PodiumEntry[];
};

export function CircuitWinnersTimeline({
  circuitId,
}: {
  circuitId: number | null;
}) {
  const [years, setYears] = useState<YearEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (circuitId === null) {
      setYears(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/circuit-winners-by-year?id=${circuitId}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        setYears(data.years ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;

        setYears([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitId]);

  // Open the matrix on the latest races while preserving chronological order.
  useLayoutEffect(() => {
    const element = scrollRef.current;

    if (!element || !years?.length) return;

    element.scrollLeft = element.scrollWidth;
  }, [years]);

  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[13px]"
        style={{ color: TEXT_MUTED }}
      >
        Loading…
      </div>
    );
  }

  if (!years || years.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[13px]"
        style={{ color: TEXT_MUTED }}
      >
        No results at this circuit yet.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <PositionColumn />

      <div
        ref={scrollRef}
        className="podium-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex h-full min-w-max items-stretch gap-1 px-2.5">
          {years.map((entry) => (
            <PodiumYearColumn
              key={`${entry.year}-${entry.raceName}`}
              entry={entry}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .podium-scroll {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }

        .podium-scroll:hover {
          scrollbar-color: rgba(199, 197, 208, 0.32) transparent;
        }

        .podium-scroll::-webkit-scrollbar {
          height: 4px;
        }

        .podium-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .podium-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: transparent;
        }

        .podium-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(199, 197, 208, 0.32);
        }

        .podium-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(232, 230, 240, 0.48);
        }
      `}</style>
    </div>
  );
}

function PositionColumn() {
  return (
    <div
      className="relative z-10 flex w-[30px] shrink-0 flex-col border-r pr-1"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background: "transparent",
      }}
    >
      <div className="h-[25px] shrink-0" />

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {[1, 2, 3].map((position) => (
          <div
            key={position}
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ color: MEDAL[position] }}
          >
            <span className="text-[10px] font-bold italic tabular-nums">
              P{position}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PodiumYearColumn({ entry }: { entry: YearEntry }) {
  const podium = [1, 2, 3].map((position) =>
    entry.podium.find((item) => item.position === position),
  );

  return (
    <article className="flex h-full w-[50px] shrink-0 flex-col">
      <header className="flex h-[25px] shrink-0 items-center justify-center">
        <span
          className="text-[9.5px] font-medium italic tabular-nums"
          style={{ color: TEXT_MUTED }}
        >
          {entry.year}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {podium.map((driver, index) => {
          const position = index + 1;

          return driver ? (
            <PodiumCell
              key={`${driver.driverId}-${position}`}
              driver={driver}
              year={entry.year}
              position={position}
            />
          ) : (
            <EmptyPodiumCell key={position} />
          );
        })}
      </div>
    </article>
  );
}

function PodiumCell({
  driver,
  year,
  position,
}: {
  driver: PodiumEntry;
  year: number;
  position: number;
}) {
  const [hover, setHover] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const team = teamColor(driver.constructorRef, year);
  const code = getDriverCode(driver.name);
  const hovered = hover !== null;

  return (
    <>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border transition-[background-color,border-color,transform] duration-150"
        style={{
          background:
            position === 1
              ? hovered
                ? "rgba(203,169,86,0.10)"
                : "rgba(203,169,86,0.055)"
              : hovered
                ? "rgba(255,255,255,0.055)"
                : CELL_BACKGROUND,
          borderColor: hovered
            ? "rgba(255,255,255,0.16)"
            : CELL_BORDER,
          transform: hovered ? "translateY(-1px)" : "translateY(0)",
        }}
        onMouseEnter={(event) =>
          setHover({
            x: event.clientX,
            y: event.clientY,
          })
        }
        onMouseMove={(event) =>
          setHover({
            x: event.clientX,
            y: event.clientY,
          })
        }
        onMouseLeave={() => setHover(null)}
      >
        <span
          className="absolute inset-x-1 bottom-0 h-[2px] rounded-full"
          style={{ background: team }}
          aria-hidden="true"
        />

        <span
          className={`relative z-10 tracking-[0.06em] ${
            position === 1
              ? "text-[10.5px] font-bold"
              : "text-[10px] font-semibold"
          }`}
          style={{
            color: hovered
              ? TEXT_PRIMARY
              : position === 1
                ? TEXT_PRIMARY
                : TEXT_SECONDARY,
          }}
        >
          {code}
        </span>
      </div>

      {hover &&
        createPortal(
          <DriverTooltip
            x={hover.x}
            y={hover.y}
            driver={driver}
            year={year}
            position={position}
            teamColorValue={team}
          />,
          document.body,
        )}
    </>
  );
}

function DriverTooltip({
  x,
  y,
  driver,
  year,
  position,
  teamColorValue,
}: {
  x: number;
  y: number;
  driver: PodiumEntry;
  year: number;
  position: number;
  teamColorValue: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState({
    top: y - 10,
    left: x + 14,
    ready: false,
  });

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) return;

    const margin = 12;
    const rect = element.getBoundingClientRect();

    let top = y - 10;
    let left = x + 14;

    if (top + rect.height + margin > window.innerHeight) {
      top = y - rect.height - 10;
    }

    if (left + rect.width + margin > window.innerWidth) {
      left = x - rect.width - 14;
    }

    if (top < margin) top = margin;
    if (left < margin) left = margin;

    setPos({
      top,
      left,
      ready: true,
    });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[9999] min-w-[190px] rounded-lg border px-3 py-2.5"
      style={{
        top: pos.top,
        left: pos.left,
        opacity: pos.ready ? 1 : 0,
        borderColor: "rgba(255,255,255,0.10)",
        background: "rgba(12,13,32,0.98)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.50)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <span
          className="text-[10px] font-bold italic"
          style={{ color: MEDAL[position] }}
        >
          P{position}
        </span>

        <span
          className="text-[9.5px] italic tabular-nums"
          style={{ color: TEXT_MUTED }}
        >
          {year}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span
          className="h-8 w-[3px] shrink-0 rounded-full"
          style={{ background: teamColorValue }}
          aria-hidden="true"
        />

        <div className="min-w-0">
          <div
            className="truncate text-[12px] font-semibold leading-tight"
            style={{ color: TEXT_PRIMARY }}
          >
            {driver.name}
          </div>

          <div
            className="mt-1 truncate text-[10px] leading-tight"
            style={{ color: TEXT_MUTED }}
          >
            {driver.team}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyPodiumCell() {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center rounded-md border"
      style={{
        background: "rgba(255,255,255,0.01)",
        borderColor: "rgba(255,255,255,0.035)",
        color: TEXT_MUTED,
      }}
    >
      <span className="text-[10px]">—</span>
    </div>
  );
}

function getDriverCode(name: string) {
  const surname = name.trim().split(/\s+/).slice(-1)[0] ?? "";

  return surname
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "")
    .slice(0, 3)
    .toUpperCase();
}