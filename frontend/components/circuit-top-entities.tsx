"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Vertical "most successful here" block. Narrow by design — the row to its
// right is reserved for future visualizations, so this column stays a compact
// list rather than a wide table.
//
// No team colour stripe: most drivers who show up in a circuit's top 5 raced
// for more than one team there, so a single stripe would misrepresent the
// record (which team, from which years?). Instead, hovering a row shows a
// tooltip with the full per-team breakdown from the API.
//
// The drivers/constructors toggle is LOCAL to this panel — it is not the
// header's driver/constructor toggle (that one is unwired global state for
// the Seasons page per the project handoff, and wiring the two together would
// couple a circuit profile to season-page state for no real benefit).

export type Mode = "drivers" | "constructors";

// Explains what the percentages mean, in place of a permanent caption line.
// Styling matches PerformanceInfo in app/constructors/page.tsx — the
// project's existing pattern for this exact kind of "small print" tooltip —
// mirrored to the left edge instead of the right, since the mode toggle
// already owns the top-right corner via GlassPanel's `action` slot.
function PctInfo() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="What the percentages mean"
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.30]"
      >
        <img
          src="/info.png"
          alt=""
          aria-hidden="true"
          className="h-[13px] w-[13px] object-contain opacity-60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          style={{ filter: "invert(86%)" }}
        />
      </button>

      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[26px] z-[200] w-[260px] translate-y-1 rounded-lg border border-white/10 px-3 py-2.5 text-left opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{
          background: "rgba(12, 13, 32, 1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        }}
      >
        <p className="text-[10px] font-semibold italic text-white/90">
          What the percentages mean
        </p>
        <p className="mt-1.5 text-[9px] leading-[1.45] text-white/65">
          Win % and Podium % are a share of races started at this circuit.
        </p>
        <p className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-[1.45] text-white/50">
          Sprint % is a share of sprints started here instead — most
          circuits have held very few, so dividing by total race starts would
          understate it.
        </p>
      </div>
    </div>
  );
}

type PartnerBreakdown = {
  partnerKey: string;
  partnerName: string;
  wins: number[];
  podiums: number[];
  poles: number[];
  sprintWins: number[];
};

type EntityRow = {
  id: number;
  code: string;
  name: string;
  starts: number;
  wins: number;
  winPct: number | null;
  podiums: number;
  podiumPct: number | null;
  poles: number;
  sprintWins: number | null;
  sprintWinPct: number | null;
  breakdown: PartnerBreakdown[];
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.88)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.55)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const RANK_COLOR = "rgba(199, 197, 208, 0.40)";

// `mode` is now a controlled prop — owned by the page, not this component —
// so the toggle can live in GlassPanel's own top-right `action` slot (same
// visual row as the panel title) instead of a separate row inside the body.
// See ModeToggle's export below; app/circuits/page.tsx wires the two together.
export function CircuitTopEntities({
  circuitId,
  mode,
}: {
  circuitId: number | null;
  mode: Mode;
}) {
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (circuitId === null) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/circuit-top-entities?id=${circuitId}&mode=${mode}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setEntities(d.entities ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntities([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitId, mode]);

  return (
    <>
      {/* Positioned relative to GlassPanel's own <section> (the nearest
          positioned ancestor), mirroring how the panel's `action` prop sits
          at top-4 right-4 — this sits at the mirror image, top-4 left-4, so
          info icon and mode toggle read as one row with the title. */}
      <div className="absolute left-4 top-4 z-[100]">
        <PctInfo />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!loading && entities && entities.length > 0 && (
          <ColumnHeader mode={mode} />
        )}

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {loading && (
          <div
            className="flex flex-1 items-center justify-center text-[13px]"
            style={{ color: TEXT_MUTED }}
          >
            Loading…
          </div>
        )}

        {!loading && entities && entities.length === 0 && (
          <div
            className="flex flex-1 items-center justify-center px-2 text-center text-[13px]"
            style={{ color: TEXT_MUTED }}
          >
            No results at this circuit yet.
          </div>
        )}

        {!loading &&
          entities?.map((e, i) => (
            <EntityRowItem key={e.id} rank={i + 1} entity={e} mode={mode} />
          ))}
      </div>
      </div>
    </>
  );
}


// Printed once above the list. Without it, four bare numbers per row are
// unreadable — nothing says which column is wins vs. poles.
// Printed once above the list. Style matches the italic, sentence-case
// micro-labels used elsewhere on this page (the identity block's "Years" /
// "Grands Prix" stats) rather than an uppercase data-table look — this page
// doesn't invent its own typographic voice for one panel.
function ColumnHeader({ mode }: { mode: Mode }) {
  return (
    <div
      className="mb-1.5 mt-2 flex shrink-0 items-center gap-2 px-2 text-[10.5px] italic"
      style={{ color: TEXT_MUTED }}
    >
      <span className="w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 text-center">
        {mode === "drivers" ? "Driver" : "Constructor"}
      </span>
      <div className="flex shrink-0 items-center gap-3">
        <span className="w-11 text-center">Wins</span>
        <span className="w-14 text-center">Podiums</span>
        <span className="w-11 text-center">Poles</span>
        <span className="w-14 text-center">Sprint</span>
      </div>
    </div>
  );
}

// Exported: app/circuits/page.tsx renders this in GlassPanel's `action` slot
// (top-right, same row as the panel title) rather than inside the panel body.
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      className="flex items-center overflow-hidden rounded-md border"
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}
    >
      <button
        type="button"
        onClick={() => onChange("drivers")}
        aria-label="Drivers"
        aria-pressed={mode === "drivers"}
        className="flex h-5 w-7 items-center justify-center transition-colors"
        style={{ background: mode === "drivers" ? "rgba(255,255,255,0.12)" : "transparent" }}
      >
        <img
          src="/helmet.png"
          alt=""
          className="h-2.5 w-3.5 object-contain"
          style={{
            filter: "invert(1)",
            transform: "scaleX(-1)",
            opacity: mode === "drivers" ? 0.92 : 0.4,
          }}
        />
      </button>
      <div className="h-3 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
      <button
        type="button"
        onClick={() => onChange("constructors")}
        aria-label="Constructors"
        aria-pressed={mode === "constructors"}
        className="flex h-5 w-7 items-center justify-center transition-colors"
        style={{ background: mode === "constructors" ? "rgba(255,255,255,0.12)" : "transparent" }}
      >
        <img
          src="/car-of-formula-1.png"
          alt=""
          className="h-3 w-3 object-contain"
          style={{
            filter: "invert(1)",
            transform: "scaleX(-1)",
            opacity: mode === "constructors" ? 0.92 : 0.4,
          }}
        />
      </button>
    </div>
  );
}

function EntityRowItem({
  rank,
  entity,
  mode,
}: {
  rank: number;
  entity: EntityRow;
  mode: Mode;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // Available for both modes now: driver rows show which team they scored
  // with and when, constructor rows show which driver and when.
  const hasBreakdown = entity.breakdown.length > 0;

  return (
    <div
      className="relative flex flex-1 items-center gap-2 rounded-lg px-2.5"
      style={{ background: "rgba(255,255,255,0.025)" }}
      onMouseMove={(e) =>
        hasBreakdown && setHover({ x: e.clientX, y: e.clientY })
      }
      onMouseEnter={(e) =>
        hasBreakdown && setHover({ x: e.clientX, y: e.clientY })
      }
      onMouseLeave={() => setHover(null)}
    >
      <span
        className="w-3.5 shrink-0 text-center text-[11px] font-semibold italic"
        style={{ color: RANK_COLOR }}
      >
        {rank}
      </span>

      <span className="min-w-0 flex-1" title={entity.name}>
        <span
          className="block truncate text-[12.5px] font-medium leading-tight"
          style={{
            color: TEXT_PRIMARY,
            textDecorationLine: hasBreakdown ? "underline" : "none",
            textDecorationColor: "rgba(255,255,255,0.15)",
            textUnderlineOffset: "3px",
          }}
        >
          {entity.name}
        </span>
        <span className="mt-0.5 block text-[10px]" style={{ color: TEXT_MUTED }}>
          {entity.starts} {entity.starts === 1 ? "start" : "starts"}
        </span>
      </span>

      <div className="flex shrink-0 items-center gap-3">
        <StatCol value={entity.wins} pct={entity.winPct} width="w-11" />
        <StatCol value={entity.podiums} pct={entity.podiumPct} width="w-14" />
        <StatCol value={entity.poles} pct={null} width="w-11" />
        <StatCol value={entity.sprintWins} pct={entity.sprintWinPct} width="w-14" />
      </div>

      {hover &&
        createPortal(
          <BreakdownTooltip x={hover.x} y={hover.y} entity={entity} />,
          document.body
        )}
    </div>
  );
}

// One column of the stat table: count on top, percentage (or nothing, for
// poles) below. Widths are passed in so they line up under ColumnHeader's
// labels above — same four widths in both places.
function StatCol({
  value,
  pct,
  width,
}: {
  value: number | null;
  pct: number | null;
  width: string;
}) {
  return (
    <div className={`flex ${width} shrink-0 flex-col items-center`}>
      <span
        className="text-[13px] font-semibold leading-none"
        style={{ color: value === null ? TEXT_MUTED : TEXT_PRIMARY }}
      >
        {value === null ? "\u2014" : value}
      </span>
      <span
        className="mt-1 text-[9.5px] leading-none"
        style={{ color: TEXT_MUTED }}
      >
        {pct !== null ? `${pct}%` : "\u00b7"}
      </span>
    </div>
  );
}

// Row header changes per mode: driver rows are broken down "by team",
// constructor rows "by driver" — entity.breakdown carries whichever the API
// grouped by, so this component doesn't need to know which mode it's in.
//
// Position is measured, not guessed. Breakdown length varies wildly — one
// team with one line, or four teams with four lines each — so a fixed
// "assume it's short" offset would clip against the bottom of the dashboard
// for any row in the lower half of the panel. Render once off-screen
// (opacity 0), measure the real box with getBoundingClientRect(), then flip
// above the cursor — or left of it — whenever the default placement
// would run past the viewport edge.
function BreakdownTooltip({
  x,
  y,
  entity,
}: {
  x: number;
  y: number;
  entity: EntityRow;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ready: boolean }>({
    top: y - 10,
    left: x + 16,
    ready: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const margin = 12;
    const rect = el.getBoundingClientRect();

    let top = y - 10;
    let left = x + 16;

    // Flip above the cursor if the default placement would run off the
    // bottom edge; clamp so it can't then run off the top either.
    if (top + rect.height + margin > window.innerHeight) {
      top = y - rect.height - 10;
    }
    if (top < margin) top = margin;

    // Same idea horizontally: flip to the left of the cursor near the right
    // edge (relevant once the page has content in the wide right column).
    if (left + rect.width + margin > window.innerWidth) {
      left = x - rect.width - 16;
    }
    if (left < margin) left = margin;

    setPos({ top, left, ready: true });
    // Re-measure whenever the cursor moves to a new row (x/y change) or the
    // content changes shape (different entity — different breakdown length).
  }, [x, y, entity]);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[9999] rounded-lg border px-3 py-2"
      style={{
        top: pos.top,
        left: pos.left,
        // Hidden until the real height is measured — avoids a one-frame
        // flash at the wrong (unflipped) position. useLayoutEffect runs
        // before paint, so this never shows up as visible flicker.
        opacity: pos.ready ? 1 : 0,
        borderColor: "rgba(255,255,255,0.10)",
        background: "rgba(12, 13, 32, 1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.50)",
        minWidth: 240,
        maxWidth: 320,
      }}
    >
      <div
        className="mb-2 text-[11px] font-medium"
        style={{ color: TEXT_PRIMARY }}
      >
        {entity.name}
      </div>
      <div className="flex flex-col gap-2.5">
        {entity.breakdown.map((p) => (
          <div key={p.partnerKey}>
            <div className="mb-1 text-[11.5px] font-medium" style={{ color: TEXT_PRIMARY }}>
              {p.partnerName}
            </div>
            <div className="flex flex-col gap-0.5">
              <BreakdownLine label="Win" years={p.wins} />
              <BreakdownLine label="Podium" years={p.podiums} />
              <BreakdownLine label="Pole" years={p.poles} />
              <BreakdownLine label="Sprint win" years={p.sprintWins} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One line per kind, only rendered when it has years — a driver who won with
// a team but never poled for them simply has no "Pole" line, rather than a
// "Pole: 0" that clutters every entry.
function BreakdownLine({ label, years }: { label: string; years: number[] }) {
  if (years.length === 0) return null;
  return (
    <div className="flex items-baseline gap-1.5 text-[10.5px]">
      <span style={{ color: TEXT_SECONDARY, minWidth: 62 }}>{label}:</span>
      <span className="italic" style={{ color: TEXT_MUTED }}>
        {years.join(", ")}
      </span>
    </div>
  );
}
