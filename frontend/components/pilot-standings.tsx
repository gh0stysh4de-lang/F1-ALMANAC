"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type StandingRow = {
  name: string;
  team: string;
  color: string;
  points: number;
  tooltip: string;
  gold: number;
  silver: number;
  bronze: number;
  wins: number;
  p2: number;
  p3: number;
};

type ScrollbarState = {
  hasOverflow: boolean;
  thumbHeight: number;
  thumbTop: number;
};

const GOLD = "rgba(203, 169, 86, 0.99)";
const SILVER = "rgba(156, 164, 184, 0.99)";
const BRONZE = "rgba(154, 100, 65, 0.99)";
const REST = "rgba(130, 134, 168, 0.42)";
const LABEL = "rgba(255,255,255,0.4)";
const NAME = "#c7c5d0";

type Mode = "drivers" | "constructors";

function Bar({ row, max }: { row: StandingRow; max: number }) {
  const rest = Math.max(0, row.points - row.gold - row.silver - row.bronze);
  const barW = (row.points / max) * 100;
  const parts: [number, string][] = [];

  if (row.gold > 0) parts.push([row.gold, GOLD]);
  if (row.silver > 0) parts.push([row.silver, SILVER]);
  if (row.bronze > 0) parts.push([row.bronze, BRONZE]);
  if (rest > 0) parts.push([rest, REST]);

  return (
    <span className="flex h-[10px] flex-1 items-center rounded-full bg-white/[0.035] px-[5px]">
      <span className="flex h-[3.5px]" style={{ width: `${barW}%` }}>
        {parts.map(([val, color], idx) => (
          <span
            key={idx}
            className="h-full rounded-full"
            style={{
              width: `${(val / row.points) * 100}%`,
              background: color,
              marginLeft: idx > 0 ? 2 : 0,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function PilotStandings({
  season = 2024,
  mode = "drivers",
}: {
  season?: number;
  mode?: Mode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{
    startY: number;
    startScrollTop: number;
  } | null>(null);

  const [list, setList] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const [hover, setHover] = useState<{
    team: string;
    x: number;
    y: number;
  } | null>(null);

  const [scrollbar, setScrollbar] = useState<ScrollbarState>({
    hasOverflow: false,
    thumbHeight: 0,
    thumbTop: 0,
  });

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  const updateScrollbar = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const clientHeight = el.clientHeight;
    const scrollHeight = el.scrollHeight;
    const maxScrollTop = scrollHeight - clientHeight;

    if (maxScrollTop <= 1) {
      setScrollbar({
        hasOverflow: false,
        thumbHeight: 0,
        thumbTop: 0,
      });
      return;
    }

    const thumbHeight = Math.max(
      28,
      Math.round((clientHeight / scrollHeight) * clientHeight)
    );

    const maxThumbTravel = clientHeight - thumbHeight;

    const thumbTop =
      maxThumbTravel > 0
        ? (el.scrollTop / maxScrollTop) * maxThumbTravel
        : 0;

    setScrollbar({
      hasOverflow: true,
      thumbHeight,
      thumbTop,
    });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();

    setLoading(true);
    setError(null);

    fetch(`/api/standings?season=${season}&mode=${mode}`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as StandingRow[];
      })
      .then((data) => {
        setList(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;

        console.error("[PilotStandings] fetch failed:", err);
        setError("Could not load standings.");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [season, mode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollbar();

    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(el);

    window.addEventListener("resize", updateScrollbar);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollbar);
    };
  }, [list, updateScrollbar]);

  function handleThumbPointerDown(
    e: ReactPointerEvent<HTMLButtonElement>
  ) {
    const el = scrollRef.current;
    if (!el) return;

    e.preventDefault();

    dragRef.current = {
      startY: e.clientY,
      startScrollTop: el.scrollTop,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleThumbPointerMove(
    e: ReactPointerEvent<HTMLButtonElement>
  ) {
    const el = scrollRef.current;
    const drag = dragRef.current;

    if (!el || !drag || !scrollbar.hasOverflow) return;

    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const maxThumbTravel = el.clientHeight - scrollbar.thumbHeight;

    if (maxScrollTop <= 0 || maxThumbTravel <= 0) return;

    const deltaY = e.clientY - drag.startY;

    el.scrollTop =
      drag.startScrollTop + deltaY * (maxScrollTop / maxThumbTravel);
  }

  function handleThumbPointerUp(
    e: ReactPointerEvent<HTMLButtonElement>
  ) {
    dragRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[12px] italic" style={{ color: LABEL }}>
          Loading…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[12px] italic" style={{ color: LABEL }}>
          {error}
        </span>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <span
          className="text-[11px] italic leading-relaxed"
          style={{ color: LABEL }}
        >
          {mode === "constructors"
            ? "No Constructors' Championship before 1958"
            : "No standings for this season"}
        </span>
      </div>
    );
  }

  const max = list[0]?.points ?? 1;

  const longest = list.reduce((m, r) => Math.max(m, r.name.length), 0);

  const nameColW = Math.min(
    160,
    Math.max(96, Math.round(longest * 6.6) + 46)
  );

  return (
    <div className="flex h-full flex-col">
      <style jsx global>{`
        .standings-native-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .standings-native-scroll::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>

      <div className="group/standings relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="standings-native-scroll flex h-full min-h-0 flex-col overflow-y-auto"
          onScroll={updateScrollbar}
        >
          {list.map((row, i) => (
            <div
              key={`${row.name}-${i}`}
              className="flex flex-1 items-center gap-1.5 border-b border-white/[0.06] last:border-b-0"
              style={{ minHeight: 17 }}
              onMouseEnter={(e) =>
                setHover({
                  team: row.tooltip,
                  x: e.clientX,
                  y: e.clientY,
                })
              }
              onMouseMove={(e) =>
                setHover({
                  team: row.tooltip,
                  x: e.clientX,
                  y: e.clientY,
                })
              }
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="flex flex-shrink-0 items-center gap-2"
                style={{ width: nameColW }}
              >
                <span
                  className="w-3.5 text-center text-[11px] font-semibold italic"
                  style={{ color: LABEL }}
                >
                  {i + 1}
                </span>

                <span
                  className="h-3 w-0.5 rounded-[1px]"
                  style={{ background: row.color }}
                />

                <span
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold"
                  style={{ color: NAME }}
                >
                  {row.name}
                </span>
              </div>

              <Bar row={row} max={max} />

              <span
                className="w-9 text-right text-[12px] font-semibold"
                style={{ color: NAME }}
              >
                {row.points}
              </span>
            </div>
          ))}
        </div>

        {scrollbar.hasOverflow && (
          <div className="pointer-events-none absolute bottom-0 right-[-14px] top-0 w-[7px] opacity-0 transition-opacity duration-150 group-hover/standings:opacity-100">
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-white/[0.04]" />

            <button
              type="button"
              aria-label="Scroll standings"
              className="pointer-events-auto absolute left-0 w-full cursor-grab rounded-full bg-white/[0.28] transition-colors hover:bg-white/[0.48] active:cursor-grabbing"
              style={{
                top: scrollbar.thumbTop,
                height: scrollbar.thumbHeight,
                touchAction: "none",
              }}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              onPointerCancel={handleThumbPointerUp}
            />
          </div>
        )}
      </div>

      {hover &&
        hover.team &&
        portalRoot &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[300] rounded-md px-2 py-1 text-[11px] font-medium"
            style={{
              left: hover.x + 14,
              top: hover.y + 14,
              background: "rgba(20,20,32,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(232,230,240,0.92)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            {hover.team}
          </div>,
          portalRoot
        )}
    </div>
  );
}