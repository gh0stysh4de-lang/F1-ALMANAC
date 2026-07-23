"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Landing state for the Seasons page, shown until a year is picked.
// The picker area always reserves its full height to prevent layout shifts
// while season data is loading.

type CardSize = "sm" | "md" | "lg";

const SIZE_BY_DISTANCE: CardSize[] = ["lg", "md", "sm"];

const DIMENSIONS: Record<CardSize, { height: number; font: number }> = {
  sm: { height: 56, font: 20 },
  md: { height: 72, font: 26 },
  lg: { height: 108, font: 44 },
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.55)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.40)";

export function SeasonPicker({
  onSelect,
}: {
  onSelect: (year: number) => void;
}) {
  const [years, setYears] = useState<number[] | null>(null);
  const [centerIndex, setCenterIndex] = useState(0);
  const [pickerContentVisible, setPickerContentVisible] = useState(false);

  const wheelLockedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/seasons")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        setYears(data.years ?? []);

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (!cancelled) setPickerContentVisible(true);
          });
        });
      })
      .catch(() => {
        if (cancelled) return;

        setYears([]);

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (!cancelled) setPickerContentVisible(true);
          });
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const total = years?.length ?? 0;

  const visible = useMemo(() => {
    if (!years) return [];

    const start = Math.max(0, centerIndex - 2);
    const end = Math.min(total, centerIndex + 3);

    return years.slice(start, end).map((year, index) => ({
      year,
      index: start + index,
      distance: Math.abs(start + index - centerIndex),
    }));
  }, [years, centerIndex, total]);

  const showMoreRecent = () => {
    setCenterIndex((index) => Math.max(0, index - 1));
  };

  const showOlder = () => {
    setCenterIndex((index) => Math.min(total - 1, index + 1));
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (wheelLockedRef.current || Math.abs(event.deltaY) < 10) {
      return;
    }

    wheelLockedRef.current = true;

    if (event.deltaY > 0) {
      showOlder();
    } else {
      showMoreRecent();
    }

    window.setTimeout(() => {
      wheelLockedRef.current = false;
    }, 180);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-6">
      <div className="shrink-0 text-center">
        <p
          className="text-[18px] font-medium"
          style={{ color: "rgba(199, 197, 208, 0.48)" }}
        >
          Select a season to begin
        </p>

        <p
          className="mt-1.5 text-[14px]"
          style={{ color: "rgba(199, 197, 208, 0.30)" }}
        >
          Use the dropdown above, or pick a year below.
        </p>
      </div>

      {/* Full picker height is reserved before the API response arrives. */}
      <div className="flex h-[448px] shrink-0 flex-col items-center justify-center">
        {!years && (
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
            Loading…
          </div>
        )}

        {years && total === 0 && (
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
            No seasons available.
          </div>
        )}

        {years && total > 0 && (
          <div
            className="flex h-full flex-col items-center gap-4"
            style={{
              opacity: pickerContentVisible ? 1 : 0,
              transform: pickerContentVisible
                ? "translateY(0)"
                : "translateY(4px)",
              filter: pickerContentVisible ? "blur(0)" : "blur(2px)",
              transition:
                "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
            }}
          >
            <div
              className="flex h-[396px] flex-col items-center justify-center"
              onWheel={handleWheel}
            >
              <div className="flex flex-col items-center gap-2">
                {visible.map(({ year, index, distance }) => (
                  <YearCard
                    key={year}
                    year={year}
                    size={SIZE_BY_DISTANCE[distance] ?? "sm"}
                    onSelect={onSelect}
                    onRecenter={() => setCenterIndex(index)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <PageButton
                direction="up"
                disabled={centerIndex === 0}
                onClick={showMoreRecent}
              />

              <PageButton
                direction="down"
                disabled={centerIndex >= total - 1}
                onClick={showOlder}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function YearCard({
  year,
  size,
  onSelect,
  onRecenter,
}: {
  year: number;
  size: CardSize;
  onSelect: (year: number) => void;
  onRecenter: () => void;
}) {
  const dimensions = DIMENSIONS[size];
  const isLarge = size === "lg";

  return (
    <button
      type="button"
      aria-label={
        isLarge
          ? `Open ${year} season`
          : `Bring ${year} to centre`
      }
      onClick={isLarge ? () => onSelect(year) : onRecenter}
      className="flex w-[220px] shrink-0 items-center justify-center rounded-2xl transition-colors"
      style={{
        height: dimensions.height,
        background: isLarge
          ? "rgba(160,120,240,0.07)"
          : "rgba(255,255,255,0.02)",
        border: isLarge
          ? "1px solid rgba(160,120,240,0.35)"
          : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span
        className="font-bold leading-none tabular-nums"
        style={{
          fontSize: dimensions.font,
          color: isLarge ? TEXT_PRIMARY : TEXT_SECONDARY,
        }}
      >
        {year}
      </span>
    </button>
  );
}

function PageButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={
        direction === "up"
          ? "More recent season"
          : "Older season"
      }
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-[opacity,background-color,border-color] hover:bg-white/[0.04] disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
      style={{ borderColor: "rgba(255,255,255,0.14)" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={
            direction === "up"
              ? "M2 9 L7 4 L12 9"
              : "M2 5 L7 10 L12 5"
          }
          stroke={TEXT_SECONDARY}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}