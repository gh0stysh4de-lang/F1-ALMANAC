"use client";

import { useEffect, useMemo, useState } from "react";
import { ConstructorBadge } from "@/components/constructor-badge";
import { nationalityFlagUrl } from "@/lib/nationality-flags";
import { teamColor } from "@/lib/team-colors";

// Landing state for the Constructors page, shown until a team is picked (via
// this carousel or the header search) — same pattern as CircuitPicker.
//
// Curated, like Circuits' twelve — not derived from "current grid" data. An
// earlier version picked whoever raced in the most recent season, which
// surfaced Alpine, Cadillac, and Audi first: technically the current teams,
// but not the five a first-time visitor expects to recognise. History and
// name recognition matter more here than "still on the grid this year".
const CURATED_REFS = ["mercedes", "ferrari", "mclaren", "williams", "red_bull"] as const;

type CircuitLikeConstructor = {
  id: number;
  ref: string;
  name: string;
  nationality: string | null;
  years: string;
};

type CardSize = "sm" | "md" | "lg";

const SIZE_BY_DISTANCE: CardSize[] = ["lg", "md", "sm"];

const DIMENSIONS: Record<CardSize, { box: number; badge: number; font: number }> = {
  sm: { box: 160, badge: 72, font: 13 },
  md: { box: 210, badge: 100, font: 15 },
  lg: { box: 300, badge: 160, font: 20 },
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.65)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.40)";
const PURPLE = "rgba(160, 120, 240, 0.9)";

// Pulls the last 4-digit year out of a "1966–2026" or bare "2026" string —
// whichever formatYears() on the API side produced. No hardcoded season
// number anywhere in this file.
function lastYearOf(years: string): number | null {
  const m = years.match(/(\d{4})(?!.*\d{4})/);
  return m ? Number(m[1]) : null;
}

export function ConstructorPicker({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [all, setAll] = useState<CircuitLikeConstructor[] | null>(null);
  const [centerIndex, setCenterIndex] = useState(2);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/constructors")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAll(d.constructors ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setAll([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The current grid: every constructor whose own last active year equals the
  // Curated, not derived: the "current grid" version of this (last active
  // year == max across the roster) surfaced Alpine/Cadillac/Audi first —
  // technically correct, but not what someone opening this page for the
  // first time expects to recognise. These five are picked for history and
  // recognisability, the same reasoning CircuitPicker uses for its twelve.
  const current = useMemo(() => {
    if (!all) return null;
    const byRef = new Map(all.map((c) => [c.ref, c]));
    return CURATED_REFS.map((ref) => byRef.get(ref)).filter(
      (c): c is CircuitLikeConstructor => c !== undefined
    );
  }, [all]);

  const total = current?.length ?? 0;

  const visible = useMemo(() => {
    if (!current) return [];
    const start = Math.max(0, centerIndex - 2);
    const end = Math.min(total, centerIndex + 3);
    return current.slice(start, end).map((c, i) => ({
      constructor: c,
      index: start + i,
      distance: Math.abs(start + i - centerIndex),
    }));
  }, [current, centerIndex, total]);

  return (
    <div className="flex h-[768px] flex-col px-8 pt-10">
      <div className="shrink-0 text-center">
        <p className="text-[18px] font-medium" style={{ color: "rgba(199, 197, 208, 0.48)" }}>
          Select a constructor to begin
        </p>
        <p className="mt-1.5 text-[14px]" style={{ color: "rgba(199, 197, 208, 0.30)" }}>
          Use the search box above, or pick a constructor below.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {!current && (
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
            Loading…
          </div>
        )}

        {current && total > 0 && (
          <div className="flex items-center gap-6">
            <PageButton
              direction="left"
              disabled={centerIndex === 0}
              onClick={() => setCenterIndex((i) => Math.max(0, i - 1))}
            />

            <div className="flex items-center gap-5">
              {visible.map(({ constructor: c, index, distance }) => (
                <ConstructorCard
                  key={c.id}
                  constructor={c}
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
        <div className="mb-10 flex shrink-0 items-center justify-center gap-2">
          {current?.map((c, i) => (
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

function ConstructorCard({
  constructor: c,
  size,
  onSelect,
  onRecenter,
}: {
  constructor: CircuitLikeConstructor;
  size: CardSize;
  onSelect: (id: number) => void;
  onRecenter: () => void;
}) {
  const dim = DIMENSIONS[size];
  const isLarge = size === "lg";
  const lastYear = lastYearOf(c.years);
  const accent = teamColor(c.ref, lastYear ?? undefined);
  const flag = nationalityFlagUrl(c.nationality, "w20");

  return (
    <button
      type="button"
      aria-label={isLarge ? `Open ${c.name}` : `Bring ${c.name} to centre`}
      onClick={isLarge ? () => onSelect(c.id) : onRecenter}
      className="group flex shrink-0 flex-col items-center rounded-2xl p-4 text-left transition-colors"
      style={{
        width: dim.box,
        background: isLarge ? "rgba(160,120,240,0.07)" : "rgba(255,255,255,0.02)",
        border: isLarge
          ? "1px solid rgba(160,120,240,0.35)"
          : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center justify-center" style={{ height: dim.badge + 18, width: "100%" }}>
        <ConstructorBadge constructorRef={c.ref} name={c.name} accent={accent} size={dim.badge} />
      </div>

      <div
        className="mt-3 w-full truncate text-center font-medium leading-tight transition-colors group-hover:text-white"
        style={{ color: isLarge ? TEXT_PRIMARY : TEXT_SECONDARY, fontSize: dim.font }}
      >
        {c.name}
      </div>

      {isLarge && (
        <div className="mt-1.5 flex items-center gap-2 text-[12px]" style={{ color: TEXT_MUTED }}>
          {flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flag} alt="" width={18} height={13} className="rounded-[1px]" />
          )}
          {c.nationality}
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
      aria-label={direction === "left" ? "Previous constructor" : "Next constructor"}
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
