"use client";

import { useEffect, useMemo, useState } from "react";
import { DriverPhoto } from "@/components/driver-photo";
import { nationalityFlagUrl } from "@/lib/nationality-flags";

// Landing state for the Drivers page, shown until a driver is picked (via
// this carousel or the header search) — same pattern as Circuit/Constructor
// pickers.
//
// The curated set here is COMPUTED, not named: /api/drivers-most-titled runs
// a real query over driver_standings (season champion = position 1 at that
// season's final round, per this project's own documented convention) rather
// than hardcoding "Schumacher, Hamilton, Fangio..." from memory — the kind of
// stat that's easy to misremember and that drifts every time a new champion
// is crowned. Circuits and Constructors used a hand-picked list because
// "recognisable" and "historic" are judgment calls; title count isn't — it's
// a number the database already has.

type TitledDriver = {
  id: number;
  code: string;
  name: string;
  nationality: string | null;
  titles: number;
  firstTitleYear: number;
  lastTitleYear: number;
};

type CardSize = "sm" | "md" | "lg";

const SIZE_BY_DISTANCE: CardSize[] = ["lg", "md", "sm"];

const DIMENSIONS: Record<CardSize, { box: number; photo: number; font: number }> = {
  sm: { box: 160, photo: 72, font: 13 },
  md: { box: 210, photo: 100, font: 15 },
  lg: { box: 300, photo: 160, font: 20 },
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.65)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.40)";
const PURPLE = "rgba(160, 120, 240, 0.9)";

export function DriverPicker({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [drivers, setDrivers] = useState<TitledDriver[] | null>(null);
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  const [centerIndex, setCenterIndex] = useState(2);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/drivers-most-titled")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: TitledDriver[] = d.drivers ?? [];
        setDrivers(list);

        // A fixed set of exactly 10 — one round of parallel requests, once,
        // not per-render and not on every arrow click. Each driver's photo
        // resolves independently, so a single slow or missing Wikipedia
        // thumbnail doesn't block or blank the other nine.
        list.forEach((driver) => {
          fetch(`/api/driver-photo?id=${driver.id}`)
            .then((r) => r.json())
            .then((res) => {
              if (cancelled) return;
              setPhotos((prev) => ({ ...prev, [driver.id]: res.photoUrl ?? null }));
            })
            .catch(() => {
              if (cancelled) return;
              setPhotos((prev) => ({ ...prev, [driver.id]: null }));
            });
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDrivers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = drivers?.length ?? 0;

  const visible = useMemo(() => {
    if (!drivers) return [];
    const start = Math.max(0, centerIndex - 2);
    const end = Math.min(total, centerIndex + 3);
    return drivers.slice(start, end).map((d, i) => ({
      driver: d,
      index: start + i,
      distance: Math.abs(start + i - centerIndex),
    }));
  }, [drivers, centerIndex, total]);

  return (
    <div className="flex h-[768px] flex-col px-8 pt-10">
      <div className="shrink-0 text-center">
        <p className="text-[18px] font-medium" style={{ color: "rgba(199, 197, 208, 0.48)" }}>
          Select a driver to begin
        </p>
        <p className="mt-1.5 text-[14px]" style={{ color: "rgba(199, 197, 208, 0.30)" }}>
          Use the search box above, or pick a champion below.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {!drivers && (
          <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
            Loading…
          </div>
        )}

        {drivers && total > 0 && (
          <div className="flex items-center gap-6">
            <PageButton
              direction="left"
              disabled={centerIndex === 0}
              onClick={() => setCenterIndex((i) => Math.max(0, i - 1))}
            />

            <div className="flex items-center gap-5">
              {visible.map(({ driver: d, index, distance }) => (
                <DriverCard
                  key={d.id}
                  driver={d}
                  photoUrl={photos[d.id] ?? null}
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
          {drivers?.map((d, i) => (
            <button
              key={d.id}
              type="button"
              aria-label={d.name}
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

function DriverCard({
  driver: d,
  photoUrl,
  size,
  onSelect,
  onRecenter,
}: {
  driver: TitledDriver;
  photoUrl: string | null;
  size: CardSize;
  onSelect: (id: number) => void;
  onRecenter: () => void;
}) {
  const dim = DIMENSIONS[size];
  const isLarge = size === "lg";
  const flag = nationalityFlagUrl(d.nationality, "w20");
  const titleLabel = d.titles === 1 ? "title" : "titles";

  return (
    <button
      type="button"
      aria-label={isLarge ? `Open ${d.name}` : `Bring ${d.name} to centre`}
      onClick={isLarge ? () => onSelect(d.id) : onRecenter}
      className="group flex shrink-0 flex-col items-center rounded-2xl p-4 text-left transition-colors"
      style={{
        width: dim.box,
        background: isLarge ? "rgba(160,120,240,0.07)" : "rgba(255,255,255,0.02)",
        border: isLarge
          ? "1px solid rgba(160,120,240,0.35)"
          : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-center justify-center" style={{ height: dim.photo + 18, width: "100%" }}>
        {/* photoUrl comes from a one-time batch of 10 parallel requests fired
            when the driver list loads (see the picker's effect above) — not
            fetched per-card, so paging through the carousel doesn't refetch
            anything. Resolves to null (generic icon) while in flight or if
            Wikipedia has no thumbnail for that driver. */}
        <DriverPhoto photoUrl={photoUrl} name={d.name} size={dim.photo} />
      </div>

      <div
        className="mt-3 w-full truncate text-center font-medium leading-tight transition-colors group-hover:text-white"
        style={{ color: isLarge ? TEXT_PRIMARY : TEXT_SECONDARY, fontSize: dim.font }}
      >
        {d.name}
      </div>

      {isLarge && (
        <div className="mt-1.5 flex items-center gap-2 text-[12px]" style={{ color: TEXT_MUTED }}>
          {flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flag} alt="" width={18} height={13} className="rounded-[1px]" />
          )}
          {d.titles}× {titleLabel} ({d.firstTitleYear}
          {d.firstTitleYear !== d.lastTitleYear ? `\u2013${d.lastTitleYear}` : ""})
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
      aria-label={direction === "left" ? "Previous driver" : "Next driver"}
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
