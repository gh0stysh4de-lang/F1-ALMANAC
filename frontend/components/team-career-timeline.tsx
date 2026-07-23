"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type TeamTimelineStint = {
  team: string;
  color: string;
  startYear: number;
  endYear: number;
};

type SeasonPosition = {
  position: number | null;
  isLive?: boolean;
};

type TimelineYear = {
  year: number;
  stint: TeamTimelineStint | null;
};

type TeamRun = {
  stint: TeamTimelineStint;
  startIndex: number;
  length: number;
};

type HoveredTimelineYear = {
  year: number;
  stint: TeamTimelineStint | null;
  x: number;
  y: number;
};

const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const TEXT_POSITION = "rgba(224, 222, 232, 0.62)";
const GOLD = "#E8C56D";
const SILVER = "#C9CEDA";
const BRONZE = "#D7A27A";
const LIVE_PURPLE = "#B89CFF";

const DEMO_STINTS: TeamTimelineStint[] = [
  {
    team: "Minardi",
    color: "#365D9D",
    startYear: 2001,
    endYear: 2001,
  },
  {
    team: "Renault",
    color: "#F6C600",
    startYear: 2003,
    endYear: 2006,
  },
  {
    team: "McLaren",
    color: "#FF8000",
    startYear: 2007,
    endYear: 2007,
  },
  {
    team: "Renault",
    color: "#F6C600",
    startYear: 2008,
    endYear: 2009,
  },
  {
    team: "Ferrari",
    color: "#E8002D",
    startYear: 2010,
    endYear: 2014,
  },
  {
    team: "McLaren",
    color: "#FF8000",
    startYear: 2015,
    endYear: 2018,
  },
  {
    team: "Alpine",
    color: "#2293D1",
    startYear: 2021,
    endYear: 2022,
  },
  {
    team: "Aston Martin",
    color: "#229971",
    startYear: 2023,
    endYear: 2026,
  },
];

const DEMO_SEASON_POSITIONS: Record<number, SeasonPosition> = {
  2001: { position: 23 },
  2002: { position: null },
  2003: { position: 6 },
  2004: { position: 4 },
  2005: { position: 1 },
  2006: { position: 1 },
  2007: { position: 3 },
  2008: { position: 5 },
  2009: { position: 9 },
  2010: { position: 2 },
  2011: { position: 4 },
  2012: { position: 2 },
  2013: { position: 2 },
  2014: { position: 6 },
  2015: { position: 17 },
  2016: { position: 10 },
  2017: { position: 15 },
  2018: { position: 11 },
  2019: { position: null },
  2020: { position: null },
  2021: { position: 10 },
  2022: { position: 9 },
  2023: { position: 4 },
  2024: { position: 9 },
  2025: { position: 10 },
  2026: { position: 18, isLive: true },
};

function getTextColor(color: string) {
  const hex = color.replace("#", "");

  if (hex.length !== 6) {
    return "rgba(255,255,255,0.92)";
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness >= 165
    ? "rgba(8, 10, 20, 0.88)"
    : "rgba(255,255,255,0.92)";
}

// Always show the full team name. Two-word names wrap onto two lines so they
// fit narrow blocks; the actual font size is measured and fitted at render time.
const FONT_MAX = 12;
const FONT_MIN = 9;

function getLabelLines(run: TeamRun): string[] {
  const team = run.stint.team;
  const words = team.split(" ");

  return words.length === 2 ? words : [team];
}

function getPositionColor(position: number) {
  if (position === 1) {
    return GOLD;
  }

  if (position === 2) {
    return SILVER;
  }

  if (position === 3) {
    return BRONZE;
  }

  return TEXT_POSITION;
}

function getPositionShadow(position: number) {
  if (position === 1) {
    return "0 0 9px rgba(232, 197, 109, 0.24)";
  }

  if (position === 2) {
    return "0 0 8px rgba(201, 206, 218, 0.16)";
  }

  if (position === 3) {
    return "0 0 8px rgba(215, 162, 122, 0.16)";
  }

  return "none";
}

function sameTeam(
  first: TeamTimelineStint | null,
  second: TeamTimelineStint | null
) {
  if (!first || !second) {
    return false;
  }

  return first.team === second.team && first.color === second.color;
}

function getTimelineYears(stints: TeamTimelineStint[]) {
  const startYear = Math.min(...stints.map((stint) => stint.startYear));
  const endYear = Math.max(...stints.map((stint) => stint.endYear));

  const years: TimelineYear[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const stint =
      stints.find(
        (item) => year >= item.startYear && year <= item.endYear
      ) ?? null;

    years.push({ year, stint });
  }

  return years;
}

function getRuns(years: TimelineYear[]) {
  const runs: TeamRun[] = [];
  let index = 0;

  while (index < years.length) {
    const current = years[index].stint;

    if (!current) {
      index += 1;
      continue;
    }

    let endIndex = index;

    while (
      endIndex + 1 < years.length &&
      sameTeam(years[endIndex + 1].stint, current)
    ) {
      endIndex += 1;
    }

    runs.push({
      stint: current,
      startIndex: index,
      length: endIndex - index + 1,
    });

    index = endIndex + 1;
  }

  return runs;
}

// Renders a team label inside its run block, shrinking the font only as needed.
function RunLabel({
  lines,
  color,
}: {
  lines: string[];
  color: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [fontSize, setFontSize] = useState(FONT_MAX);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;

    if (!box || !text) {
      return;
    }

    const fit = () => {
      let size = FONT_MAX;

      text.style.fontSize = `${size}px`;

      while (
        size > FONT_MIN &&
        (text.scrollWidth > box.clientWidth ||
          text.scrollHeight > box.clientHeight)
      ) {
        size -= 0.5;
        text.style.fontSize = `${size}px`;
      }

      setFontSize(size);
    };

    fit();

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(box);

    return () => {
      resizeObserver.disconnect();
    };
  }, [lines, color]);

  return (
    <div
      ref={boxRef}
      className="flex h-full w-full items-center justify-center overflow-hidden px-1"
    >
      <span
        ref={textRef}
        className="flex flex-col items-center justify-center text-center font-semibold leading-[1.05]"
        style={{ color, fontSize: `${fontSize}px` }}
      >
        {lines.map((line) => (
          <span key={line} className="block max-w-full truncate">
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}

function SeasonPositionLabel({
  data,
  hasStint,
}: {
  year: number;
  data?: SeasonPosition;
  hasStint: boolean;
}) {
  if (!data || data.position === null) {
    if (hasStint) {
      return (
        <div className="flex h-[15px] items-end justify-center">
          <span
            className="text-[9px] font-light leading-none tracking-[0.04em]"
            style={{ color: TEXT_MUTED }}
          >
            NC
          </span>
        </div>
      );
    }

    return <div className="h-[15px]" />;
  }

  const color = getPositionColor(data.position);

  return (
    <div className="relative flex h-[15px] items-end justify-center">
      {data.isLive && (
        <span
          className="absolute -top-[8px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[6px] font-medium leading-none tracking-[0.12em]"
          style={{
            color: LIVE_PURPLE,
            textShadow: "0 0 7px rgba(184, 156, 255, 0.24)",
          }}
        >
          LIVE
        </span>
      )}

      <span
        className="text-[10px] font-light leading-none tracking-[0.01em] tabular-nums"
        style={{
          color,
          textShadow: getPositionShadow(data.position),
        }}
      >
        P{data.position}
      </span>
    </div>
  );
}

function TimelineTooltip({
  hoveredYear,
}: {
  hoveredYear: HoveredTimelineYear;
}) {
  const TOOLTIP_WIDTH = 180;
  const VIEWPORT_PADDING = 10;

  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 1400;

  const left = Math.min(
    Math.max(
      VIEWPORT_PADDING + TOOLTIP_WIDTH / 2,
      hoveredYear.x
    ),
    viewportWidth - VIEWPORT_PADDING - TOOLTIP_WIDTH / 2
  );

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[9999] -translate-x-1/2 rounded-lg border border-white/10 px-3 py-2.5"
      style={{
        left,
        top: hoveredYear.y,
        width: TOOLTIP_WIDTH,
        background: "rgba(12, 13, 32, 1)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        fontFamily: "'Exo 2', sans-serif",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {hoveredYear.stint && (
          <span
            aria-hidden="true"
            className="h-[28px] w-[3px] shrink-0 rounded-full"
            style={{
              background: hoveredYear.stint.color,
              boxShadow: `0 0 8px color-mix(in srgb, ${hoveredYear.stint.color} 35%, transparent)`,
            }}
          />
        )}

        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold italic text-white/90">
            {hoveredYear.stint
              ? hoveredYear.stint.team
              : "No F1 entry"}
          </p>

          <p className="mt-0.5 text-[9px] tabular-nums text-white/50">
            Season {hoveredYear.year}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TeamCareerTimeline({
  stints = DEMO_STINTS,
  seasonPositions = DEMO_SEASON_POSITIONS,
}: {
  stints?: TeamTimelineStint[];
  seasonPositions?: Record<number, SeasonPosition>;
}) {
  const [hoveredYear, setHoveredYear] =
    useState<HoveredTimelineYear | null>(null);

  if (stints.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <span
          className="text-[11px] italic"
          style={{ color: TEXT_MUTED }}
        >
          No team timeline available
        </span>
      </div>
    );
  }

  const sortedStints = [...stints].sort(
    (first, second) => first.startYear - second.startYear
  );

  const years = getTimelineYears(sortedStints);
  const runs = getRuns(years);

  const gridStyle = {
    gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))`,
  };

  return (
    <div className="min-h-0 w-full flex-1">
      <div className="w-full">
        <div className="relative -mt-[2px]">
          <div
            className="mb-[3px] grid h-[15px] items-end"
            style={gridStyle}
          >
            {years.map(({ year, stint }) => (
              <SeasonPositionLabel
                key={year}
                year={year}
                data={seasonPositions[year]}
                hasStint={stint !== null}
              />
            ))}
          </div>

          <div
            className="grid h-10 overflow-hidden rounded-[10px] border border-white/[0.08] bg-black/[0.16]"
            style={gridStyle}
          >
            {years.map(({ year, stint }) => (
              <div
                key={year}
                className="relative h-10 cursor-default border-r border-black/[0.20] last:border-r-0"
                style={{
                  background: stint
                    ? `linear-gradient(135deg, ${stint.color}, ${stint.color}D6)`
                    : "linear-gradient(180deg, rgba(255,255,255,0.018), rgba(0,0,0,0.07))",
                  boxShadow: stint
                    ? "inset 0 1px 0 rgba(255,255,255,0.10)"
                    : "none",
                }}
                onMouseEnter={(event) => {
                  const rect =
                    event.currentTarget.getBoundingClientRect();

                  setHoveredYear({
                    year,
                    stint,
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 8,
                  });
                }}
                onMouseMove={(event) => {
                  const rect =
                    event.currentTarget.getBoundingClientRect();

                  setHoveredYear({
                    year,
                    stint,
                    x: rect.left + rect.width / 2,
                    y: rect.bottom + 8,
                  });
                }}
                onMouseLeave={() => {
                  setHoveredYear(null);
                }}
              />
            ))}
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[18px] grid h-10"
            style={gridStyle}
          >
            {runs.map((run) => (
              <div
                key={`${run.stint.team}-${run.startIndex}`}
                className="flex min-w-0 items-center justify-center overflow-hidden"
                style={{
                  gridColumn: `${run.startIndex + 1} / span ${run.length}`,
                }}
              >
                <RunLabel
                  lines={getLabelLines(run)}
                  color={getTextColor(run.stint.color)}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          className="relative mt-2 grid h-7"
          style={gridStyle}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-white/[0.08]" />

          {years.map(({ year }) => (
            <div
              key={year}
              className="relative z-10 flex min-w-0 flex-col items-center"
            >
              <span className="block h-2 w-px bg-white/[0.17]" />

              <span
                className="mt-1 block whitespace-nowrap text-[9px] italic leading-none"
                style={{ color: TEXT_MUTED }}
              >
                {year}
              </span>
            </div>
          ))}
        </div>
      </div>

      {hoveredYear &&
        typeof document !== "undefined" &&
        createPortal(
          <TimelineTooltip hoveredYear={hoveredYear} />,
          document.body
        )}
    </div>
  );
}