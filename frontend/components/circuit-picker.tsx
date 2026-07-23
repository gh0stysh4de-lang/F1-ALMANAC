"use client";

import { useEffect, useMemo, useState } from "react";
import { CircuitMap } from "@/components/circuit-map";
import { countryFlagUrl } from "@/lib/circuit-flags";

// Landing state for the Circuits page, shown until a circuit is picked (via
// this carousel or the header search). Replaces auto-selecting Spa: an empty
// choice screen matches how Drivers/Constructors start, but a bare "search
// above" prompt wastes the one visual thing this page can do that those
// can't — show the actual track shape — so this offers a curated set of
// circuits people are likely to recognise by outline alone.
//
// The curated list is NAMED_CIRCUITS' twelve (see circuit-map.tsx) — not
// arbitrary popularity, but the circuits with the most complete data in this
// project: turn names, reconciled numbering, dense results history.
//
// Sliding is continuous (one step per arrow), not paged in blocks of five.
// Twelve circuits doesn't divide evenly into pages of five — 5, 5, 2 — and
// that trailing near-empty page looks like a mistake. A single centre index
// with a five-wide window around it has no such remainder: the last click
// just stops advancing once the final circuit reaches centre.

const CURATED_REFS = [
  "monaco",
  "spa",
  "silverstone",
  "monza",
  "suzuka",
  "interlagos",
  "nurburgring",
  "red_bull_ring",
  "zandvoort",
  "imola",
  "catalunya",
  "hungaroring",
] as const;

// The database only stores the official name ("Autodromo Nazionale di
// Monza", "Circuit de Spa-Francorchamps") — there's no short-name column to
// pull from, per the schema. These are display-only overrides for the
// picker's cards, where a long official name either truncates or forces the
// card wider than the carousel can afford; the full name still shows
// everywhere else in the app once a circuit is actually opened.
const SHORT_NAME: Record<string, string> = {
  monaco: "Monaco",
  spa: "Spa-Francorchamps",
  silverstone: "Silverstone",
  monza: "Monza",
  suzuka: "Suzuka",
  interlagos: "Interlagos",
  zandvoort: "Zandvoort",
  imola: "Imola",
  catalunya: "Barcelona-Catalunya",
};

type CircuitListItem = {
  id: number;
  ref: string;
  name: string;
  country: string | null;
  races: number;
};

type CardSize = "sm" | "md" | "lg";

// Size is a function of distance from centre (0/1/2), not a fixed slot
// position — this is what makes the edges of the list (centre index 0 or the
// last item) fall out naturally: fewer cards render, but each still gets the
// size its distance from centre calls for.
const SIZE_BY_DISTANCE: CardSize[] = ["lg", "md", "sm"];

// Meaningfully larger than the first pass — "fill more of the screen" was
// the explicit ask, not a marginal bump.
const DIMENSIONS: Record<CardSize, { box: number; map: number; font: number }> = {
  sm: { box: 160, map: 95, font: 13 },
  md: { box: 210, map: 140, font: 15 },
  lg: { box: 300, map: 220, font: 20 },
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.65)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.40)";
const PURPLE = "rgba(160, 120, 240, 0.9)";

export function CircuitPicker({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [circuits, setCircuits] = useState<CircuitListItem[] | null>(null);
  // Starts on the 3rd curated circuit, not the edge — landing on index 0
  // means only 3 cards can render (nothing exists to the left of it), so the
  // very first thing a visitor sees is a lopsided 3-card row instead of the
  // full 5-wide carousel.
  const [centerIndex, setCenterIndex] = useState(2);
  const [itemsVisible, setItemsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/circuits")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCircuits(d.circuits ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setCircuits([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Order by CURATED_REFS, not by whatever /api/circuits returns — that list
  // is alphabetical, and a picker should lead with the most recognisable
  // circuits (Monaco, Spa) rather than wherever they happen to sort.
  const curated = useMemo(() => {
    if (!circuits) return null;
    const byRef = new Map(circuits.map((c) => [c.ref, c]));
    return CURATED_REFS.map((ref) => byRef.get(ref)).filter(
      (c): c is CircuitListItem => c !== undefined
    );
  }, [circuits]);

  const total = curated?.length ?? 0;

  useEffect(() => {
    if (!curated) {
      setItemsVisible(false);
      return;
    }

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => setItemsVisible(true));
      return () => cancelAnimationFrame(secondFrame);
    });

    return () => cancelAnimationFrame(firstFrame);
  }, [curated]);

  // Window of up to 5 around centreIndex, clipped at the array's edges —
  // near either end this naturally yields 3 or 4 cards, not 5 padded with
  // nothing.
  const visible = useMemo(() => {
    if (!curated) return [];
    const start = Math.max(0, centerIndex - 2);
    const end = Math.min(total, centerIndex + 3);
    return curated.slice(start, end).map((c, i) => ({
      circuit: c,
      index: start + i,
      distance: Math.abs(start + i - centerIndex),
    }));
  }, [curated, centerIndex, total]);

  return (
    // Heading and dots are shrink-0 and pinned near the top/bottom; the card
    // row gets its OWN flex-1 centering wrapper below, instead of the whole
    // heading+cards+dots stack being centered as one block. Centering the
    // whole stack mathematically centers its total height, but the heading
    // text is short and light while the card row is tall and visually heavy
    // — so the block's geometric centre sits noticeably above the cards'
    // own visual weight, and the cards read as sitting low even though the
    // stack itself is centered correctly.
    <div className="flex flex-1 flex-col px-8 pt-10">
      <div className="shrink-0 text-center">
        {/* Matches the empty state on Constructors/Drivers exactly: same
            copy pattern, same two colours (rgba(199,197,208,0.48) /
            rgba(199,197,208,0.30)), same non-italic weight — not this
            picker's own accent colours, so all three "nothing selected yet"
            screens in the app read as one family. */}
        <p
          className="text-[18px] font-medium"
          style={{ color: "rgba(199, 197, 208, 0.48)" }}
        >
          Select a circuit to begin
        </p>
        <p
          className="mt-1.5 text-[14px]"
          style={{ color: "rgba(199, 197, 208, 0.30)" }}
        >
          Use the search box above, or pick a circuit below.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {!curated && (
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
            Loading…
          </div>
        )}

        {curated && total > 0 && (
          <div
            className="flex items-center gap-6 motion-reduce:transform-none motion-reduce:transition-none"
            style={{
              opacity: itemsVisible ? 1 : 0,
              transform: itemsVisible ? "translateY(0)" : "translateY(4px)",
              filter: itemsVisible ? "blur(0)" : "blur(2px)",
              transition:
                "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
              pointerEvents: itemsVisible ? "auto" : "none",
            }}
          >
            <PageButton
              direction="left"
              disabled={centerIndex === 0}
              onClick={() => setCenterIndex((i) => Math.max(0, i - 1))}
            />

            {/* items-center: smaller flanking cards sit vertically centred
                against the tall centre card. */}
            <div className="flex items-center gap-5">
              {visible.map(({ circuit, index, distance }) => (
                <CircuitCard
                  key={circuit.id}
                  circuit={circuit}
                  size={SIZE_BY_DISTANCE[distance] ?? "sm"}
                  onSelect={onSelect}
                  onRecenter={() => setCenterIndex(index)}
                />
              ))}
            </div>

            <PageButton
              direction="right"
              disabled={centerIndex >= total - 1}
              onClick={() => setCenterIndex((i) => Math.min(total - 1, i + 1))}
            />
          </div>
        )}
      </div>

      {total > 1 && (
        <div
          className="mb-10 flex shrink-0 items-center justify-center gap-2 motion-reduce:transform-none motion-reduce:transition-none"
          style={{
            opacity: itemsVisible ? 1 : 0,
            transform: itemsVisible ? "translateY(0)" : "translateY(4px)",
            filter: itemsVisible ? "blur(0)" : "blur(2px)",
            transition:
              "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
          }}
        >
          {curated?.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.name}
              onClick={() => setCenterIndex(i)}
              className="h-2 w-2 rounded-full transition-colors"
              style={{
                background: i === centerIndex ? PURPLE : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CircuitCard({
  circuit,
  size,
  onSelect,
  onRecenter,
}: {
  circuit: CircuitListItem;
  size: CardSize;
  onSelect: (id: number) => void;
  onRecenter: () => void;
}) {
  const flag = countryFlagUrl(circuit.country, 20);
  const dim = DIMENSIONS[size];
  const isLarge = size === "lg";

  return (
    <button
      type="button"
      aria-label={
        isLarge ? `Open ${circuit.name}` : `Bring ${circuit.name} to centre`
      }
      onClick={isLarge ? () => onSelect(circuit.id) : onRecenter}
      className="group flex shrink-0 flex-col items-center rounded-2xl p-4 text-left transition-colors"
      style={{
        width: dim.box,
        background: isLarge ? "rgba(160,120,240,0.07)" : "rgba(255,255,255,0.02)",
        border: isLarge
          ? "1px solid rgba(160,120,240,0.35)"
          : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ height: dim.map + 18, width: "100%" }}
      >
        <CircuitMap
          circuitRef={circuit.ref}
          accent={isLarge ? PURPLE : "rgba(160,120,240,0.55)"}
          size={dim.map}
          shade={false}
          interactive={false}
        />
      </div>

      <div
        className="mt-3 w-full truncate text-center font-medium leading-tight transition-colors group-hover:text-white"
        style={{ color: isLarge ? TEXT_PRIMARY : TEXT_SECONDARY, fontSize: dim.font }}
      >
        {SHORT_NAME[circuit.ref] ?? circuit.name}
      </div>

      {isLarge && (
        <div
          className="mt-1.5 flex items-center gap-2 text-[12px]"
          style={{ color: TEXT_MUTED }}
        >
          {flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flag} alt="" width={18} height={13} className="rounded-[1px]" />
          )}
          {circuit.races} GPs
        </div>
      )}
    </button>
  );
}

function PageButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction === "left" ? "Previous circuit" : "Next circuit"}
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-opacity disabled:opacity-25"
      style={{ borderColor: "rgba(255,255,255,0.14)" }}
    >
      <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
        <path
          d={direction === "left" ? "M9 2 L4 7 L9 12" : "M5 2 L10 7 L5 12"}
          stroke={TEXT_SECONDARY}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
