"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type CircuitRecord = {
  value: string;
  driver: string;
  team: string;
  year: number;
};

type Records = {
  fastestQualifyingLap: CircuitRecord | null;
  fastestRaceLap: CircuitRecord | null;
  fastestPitStop: CircuitRecord | null;
  fastestLapSpeed: CircuitRecord | null;
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.56)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const YEAR_COLOR = "rgba(199, 197, 208, 0.38)";

export function CircuitRecords({
  circuitId,
}: {
  circuitId: number | null;
}) {
  const [records, setRecords] = useState<Records | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (circuitId === null) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/circuit-records?id=${circuitId}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;

        setRecords(data.records ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;

        setRecords(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitId]);

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

  if (!records) {
    return (
      <div
        className="flex min-h-[128px] flex-1 items-center justify-center text-[13px]"
        style={{ color: TEXT_MUTED }}
      >
        No records available.
      </div>
    );
  }

  return (
    <div className="relative">
      <InfoButton />

      <div className="mt-2 grid grid-cols-4 gap-3">
        <Tile
          label="Fastest Qualifying Lap"
          record={records.fastestQualifyingLap}
        />

        <Tile
          label="Fastest Race Lap"
          record={records.fastestRaceLap}
        />

        <Tile
          label="Fastest Pit Lane Time"
          record={records.fastestPitStop}
        />

        <Tile
          label="Fastest Lap Speed"
          record={records.fastestLapSpeed}
        />
      </div>
    </div>
  );
}

function Tile({
  label,
  record,
}: {
  label: string;
  record: CircuitRecord | null;
}) {
  return (
    <div
      className="flex min-h-[132px] flex-col rounded-lg px-3.5 py-3"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.030) 0%, rgba(255,255,255,0.020) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.018)",
      }}
    >
      <span
        className="text-[10.5px] font-medium italic leading-tight"
        style={{ color: TEXT_MUTED }}
      >
        {label}
      </span>

      {record ? (
        <>
          <span
            className="mt-2 text-[19px] font-bold leading-none tracking-[-0.025em]"
            style={{ color: TEXT_PRIMARY }}
          >
            {record.value}
          </span>

          <span
            className="mt-auto truncate pt-3 text-[11px] font-medium leading-tight"
            style={{ color: TEXT_SECONDARY }}
          >
            {record.driver}
          </span>

          <div className="mt-1 flex items-center justify-between gap-3">
            <span
              className="min-w-0 truncate text-[9.5px] leading-tight"
              style={{ color: TEXT_MUTED }}
            >
              {record.team}
            </span>

            <span
              className="shrink-0 text-[9.5px] tabular-nums leading-tight"
              style={{ color: YEAR_COLOR }}
            >
              {record.year}
            </span>
          </div>
        </>
      ) : (
        <span
          className="mt-3 text-[16px] font-semibold"
          style={{ color: TEXT_MUTED }}
        >
          —
        </span>
      )}
    </div>
  );
}

function InfoButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="absolute left-0 top-[-28px] z-[200]">
        <button
          ref={buttonRef}
          type="button"
          aria-label="How circuit records are calculated"
          className="group flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.30]"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <img
            src="/info.png"
            alt=""
            aria-hidden="true"
            className="h-[13px] w-[13px] object-contain opacity-60 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ filter: "invert(86%)" }}
          />
        </button>
      </div>

      {open &&
        createPortal(
          <InfoTooltip anchorRef={buttonRef} />,
          document.body,
        )}
    </>
  );
}

function InfoTooltip({
  anchorRef,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;

    if (!anchor || !tooltip) return;

    const margin = 12;
    const gap = 10;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = anchorRect.left;
    let top = anchorRect.top - tooltipRect.height - gap;

    if (left + tooltipRect.width + margin > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - margin;
    }

    if (left < margin) {
      left = margin;
    }

    // Prefer opening above the icon.
    if (top < margin) {
      top = anchorRect.bottom + gap;
    }

    if (top + tooltipRect.height + margin > window.innerHeight) {
      top = window.innerHeight - tooltipRect.height - margin;
    }

    setPosition({
      top,
      left,
      ready: true,
    });
  }, [anchorRef]);

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      className="pointer-events-none fixed z-[9999] w-[320px] rounded-lg border border-white/10 px-3.5 py-3 text-left"
      style={{
        top: position.top,
        left: position.left,
        opacity: position.ready ? 1 : 0,
        background: "rgba(12, 13, 32, 1)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
      }}
    >
      <p className="mb-2.5 text-[11px] font-semibold italic text-white/90">
        How circuit records are calculated
      </p>

      <div className="flex flex-col gap-2.5">
        <InfoRow
          title="Qualifying lap"
          text="The quickest valid Q1, Q2 or Q3 time recorded here. Qualifying-time data begins in 1994, and the session format has changed across eras."
        />

        <InfoRow
          title="Race lap"
          text="The lowest valid fastest-lap time in official results. Fastest-lap times are recorded from around 2004 onward."
        />

        <InfoRow
          title="Pit lane time"
          text="The shortest total time in the pit lane — entry, stop and exit — not the ~2s stationary tyre change shown on TV. Recorded from 2011."
        />

        <InfoRow
          title="Lap speed"
          text="The highest average speed over a fastest lap — not peak straight-line or speed-trap velocity. Recorded from around 2004, alongside fastest-lap data."
        />
      </div>

      <p
        className="mt-3 border-t pt-2 text-[9px] italic leading-snug"
        style={{
          borderColor: "rgba(255,255,255,0.07)",
          color: TEXT_MUTED,
        }}
      >
        A dash means the dataset has no valid recorded value.
      </p>
    </div>
  );
}

function InfoRow({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr] gap-2.5">
      <span
        className="text-[9.5px] font-semibold leading-snug"
        style={{ color: TEXT_SECONDARY }}
      >
        {title}
      </span>

      <span
        className="text-[9.5px] leading-snug"
        style={{ color: TEXT_MUTED }}
      >
        {text}
      </span>
    </div>
  );
}