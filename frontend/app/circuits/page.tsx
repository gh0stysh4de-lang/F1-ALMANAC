"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlmanacHeader } from "@/components/almanac-header";
import { GlassPanel } from "@/components/glass-panel";
import { CircuitMap } from "@/components/circuit-map";
import { CircuitSearch } from "@/components/circuit-search";
import {
  CircuitTopEntities,
  ModeToggle,
  type Mode,
} from "@/components/circuit-top-entities";
import { countryFlagUrl } from "@/lib/circuit-flags";
import { CircuitRecords } from "@/components/circuit-records";
import { CircuitWinnersTimeline } from "@/components/circuit-winners-timeline";
import { CircuitPicker } from "@/components/circuit-picker";
import { Mountain } from "lucide-react";

// Circuits profile page.
//
// Layout below the identity block: a narrow left column (aligned to the
// identity panel's map width, 280px) holding "Top 5 Most Successful", full
// height down to the bottom of the frame — and an empty right column
// reserved for the records / winners-timeline visualizations that land next.
// This mirrors the Seasons page's narrow-left / wide-right split rather than
// inventing a new ratio.

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.88)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.48)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";
const PURPLE = "rgba(160, 120, 240, 0.9)";

type Circuit = {
  id: number;
  ref: string;
  name: string;
  location: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  url: string | null;
  races: number;
  firstYear: number | null;
  lastYear: number | null;
  // Last year this circuit is SCHEDULED for, results or not — distinct from
  // lastYear (last year with actual results). A circuit on this season's
  // calendar whose race hasn't run yet has lastYear stuck at last season,
  // which used to show "1950\u20132025" instead of "1950\u2013present" for a
  // circuit that's very much still racing.
  lastScheduledYear: number | null;
  distinctWinners: number;
};

function yearsLabel(c: Circuit): string {
  if (c.firstYear === null || c.lastYear === null) return "\u2014";
  const present = (c.lastScheduledYear ?? c.lastYear) >= new Date().getFullYear();
  if (c.firstYear === c.lastYear && !present) return `${c.firstYear}`;
  return `${c.firstYear} \u2013 ${present ? "present" : c.lastYear}`;
}

const TRANSITION_MS = 200;
const MINIMUM_LOADING_MS = 280;
const VISUAL_SETTLE_MS = 180;

export default function CircuitsPage() {
  const [circuitId, setCircuitId] = useState<number | null>(null);
  // Lifted up from CircuitTopEntities so the toggle can render in
  // GlassPanel's action slot (top-right, next to the title) while the list
  // itself still owns the fetch that depends on it.
  const [topMode, setTopMode] = useState<Mode>("drivers");
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMap, setHasMap] = useState(true);
  const [contentVisible, setContentVisible] = useState(false);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealContent = useCallback((delay = 0) => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

    revealTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setContentVisible(true));
        });
      });
    }, delay);
  }, []);

  const handleCircuitSelect = useCallback((id: number) => {
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);

    setContentVisible(false);

    selectionTimerRef.current = setTimeout(() => {
      setCircuitId(id);
      selectionTimerRef.current = null;
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    revealContent();

    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [revealContent]);

  useEffect(() => {
    if (circuitId === null) {
      setCircuit(null);
      setDescription(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setHasMap(true);
    setCircuit(null);
    setDescription(null);

    const loadCircuit = async () => {
      const startedAt = performance.now();

      try {
        const [circuitResponse, descriptionResponse] = await Promise.all([
          fetch(`/api/circuit?id=${circuitId}`, {
            signal: controller.signal,
          }),
          fetch(`/api/circuit-description?id=${circuitId}`, {
            signal: controller.signal,
          }),
        ]);

        const circuitData = circuitResponse.ok
          ? await circuitResponse.json()
          : { circuit: null };
        const descriptionData = descriptionResponse.ok
          ? await descriptionResponse.json()
          : { description: null };

        const remainingDelay = Math.max(
          0,
          MINIMUM_LOADING_MS - (performance.now() - startedAt)
        );

        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }

        if (controller.signal.aborted) return;

        setCircuit(circuitData.circuit ?? null);
        setDescription(descriptionData.description ?? null);
        setLoading(false);
        revealContent(VISUAL_SETTLE_MS);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        setCircuit(null);
        setDescription(null);
        setLoading(false);
        revealContent(VISUAL_SETTLE_MS);
      }
    };

    void loadCircuit();

    return () => controller.abort();
  }, [circuitId, revealContent]);

  const handleMissingMap = useCallback(() => setHasMap(false), []);

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden"
    >
      <div className="relative z-10 flex min-h-screen w-full items-start justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div
          className="relative flex h-[894px] w-full max-w-[1400px] flex-col overflow-hidden rounded-[12px]"
          style={{
            background: "rgba(180, 180, 210, 0.02)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "0.5px solid rgba(255, 255, 255, 0.12)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          }}
        >
          <FrameEffects />

          <div className="relative z-[200] shrink-0">
            <AlmanacHeader
              variant="circuits"
              rightSlot={
                <CircuitSearch selectedId={circuitId} onSelect={handleCircuitSelect} />
              }
            />
          </div>

          <div className="relative z-0 flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
            <div
              className="flex min-h-0 flex-1 flex-col motion-reduce:transform-none motion-reduce:transition-none"
              style={{
                opacity: contentVisible ? 1 : 0,
                transform: contentVisible ? "translateY(0)" : "translateY(4px)",
                filter: contentVisible ? "blur(0)" : "blur(2px)",
                transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease, filter ${TRANSITION_MS}ms ease`,
                pointerEvents: contentVisible ? "auto" : "none",
              }}
            >
              {circuitId === null ? (
                <CircuitPicker onSelect={handleCircuitSelect} />
              ) : (
                <div key={circuitId} className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="shrink-0">
                  <CircuitIdentity
                    circuit={circuit}
                    description={description}
                    loading={loading}
                    hasMap={hasMap}
                    onMissingMap={handleMissingMap}
                  />
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[460px_minmax(0,1fr)]">
                  <GlassPanel
                    title="Top 5 Most Successful"
                    glowLevel="soft"
                    className="flex min-h-0 flex-col"
                    bodyClassName="flex min-h-0 flex-1 flex-col"
                    action={<ModeToggle mode={topMode} onChange={setTopMode} />}
                  >
                    <CircuitTopEntities circuitId={circuitId} mode={topMode} />
                  </GlassPanel>

                  {/* Records sized to its own content (auto); the winners
                      timeline below takes whatever height is left. */}
                  {/* Fixed height, not "auto": an auto track re-measures its
                      tallest child on every render, and CircuitRecords'
                      loading/loaded states never rendered at EXACTLY the same
                      height (a tile with a caption line is taller than a bare
                      "Loading…" placeholder, even with matching min-h), so the
                      row visibly resized on every circuit switch. A fixed
                      pixel row can't do that — loading, loaded, and empty all
                      render inside the same box. */}
                  <div className="grid min-h-0 flex-1 grid-rows-[200px_minmax(0,1fr)] gap-4">
                    <GlassPanel
                      title="Circuit Records"
                      glowLevel="soft"
                      className="flex flex-col"
                      // justify-center: the tile grid's natural height doesn't
                      // fill the fixed 200px row above, and without this the
                      // slack collects entirely below the tiles (flex-col
                      // defaults to top-aligned content). Centering splits
                      // that gap evenly instead of leaving it all as dead
                      // space under the row.
                      bodyClassName="flex flex-1 flex-col justify-center"
                    >
                      <CircuitRecords circuitId={circuitId} />
                    </GlassPanel>

                    <GlassPanel
                      title="Podiums by Season"
                      glowLevel="soft"
                      className="flex min-h-0 flex-col"
                      bodyClassName="flex min-h-0 flex-1 flex-col"
                    >
                      <CircuitWinnersTimeline circuitId={circuitId} />
                    </GlassPanel>
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function CircuitIdentity({
  circuit,
  description,
  loading,
  hasMap,
  onMissingMap,
}: {
  circuit: Circuit | null;
  description: string | null;
  loading: boolean;
  hasMap: boolean;
  onMissingMap: () => void;
}) {
  const flag = countryFlagUrl(circuit?.country, 40);

  const fallback =
    circuit && circuit.races > 0
      ? `${yearsLabel(circuit)} \u00b7 ${circuit.races} championship ${
          circuit.races === 1 ? "Grand Prix" : "Grands Prix"
        } held here.`
      : null;

  return (
    <GlassPanel
      glowLevel="medium"
      className="flex flex-col"
      bodyClassName="flex flex-1 flex-col !p-0"
    >
      {loading ? (
        <div
          className="flex h-[300px] items-center justify-center text-[13px]"
          style={{ color: TEXT_MUTED }}
        >
          Loading…
        </div>
      ) : (
        <div className="grid h-[300px] grid-cols-1 gap-6 pl-5 pr-12 lg:grid-cols-[240px_minmax(0,1fr)]">
          {hasMap && circuit && (
            <div className="flex items-center justify-center self-stretch">
      <CircuitMap
  circuitRef={circuit.ref}
  accent={PURPLE}
  size={240}
  shade={true}
  interactive
  onMissing={onMissingMap}
/>
            </div>
          )}

          <div className="flex min-w-0 flex-col self-stretch pb-9 pt-9">
            {!circuit && (
              <div className="text-[13px]" style={{ color: TEXT_MUTED }}>
                Circuit not found.
              </div>
            )}

            {circuit && (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {flag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={flag}
                        alt={circuit.country ?? ""}
                        width={28}
                        height={19}
                        className="rounded-[2px]"
                        style={{
                          border: "0.5px solid rgba(255,255,255,0.14)",
                        }}
                      />
                    )}
                    <h1
                      className="truncate text-[24px] font-bold leading-none"
                      style={{ color: TEXT_PRIMARY }}
                    >
                      {circuit.name}
                    </h1>
                  </div>

                  <div
                    className="text-[13px]"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    {[circuit.location, circuit.country]
                      .filter(Boolean)
                      .join(", ")}
                    {circuit.alt !== null && (
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ color: TEXT_MUTED }}
                      >
                        {"\u00A0\u00b7 "}
                        {/* Small mountain glyph so "153 m" reads as elevation
                            at a glance instead of an unlabelled number. */}
                        <Mountain size={11} strokeWidth={2} aria-hidden="true" />
                        {Math.round(circuit.alt)} m
                      </span>
                    )}
                  </div>

                  <p
                    className="text-[13px] font-normal italic leading-relaxed"
                    style={{ color: description ? TEXT_SECONDARY : TEXT_MUTED }}
                  >
                    {description ?? fallback ?? "No description available."}
                  </p>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-y-3 sm:grid-cols-4">
                  <Stat label="Years" value={yearsLabel(circuit)} />
                  <Stat label="Grands Prix" value={String(circuit.races)} />
                  <Stat
                    label="Winners"
                    value={String(circuit.distinctWinners)}
                  />
                  {circuit.lat !== null && circuit.lng !== null && (
                    <Stat
                      label="Coordinates"
                      value={`${circuit.lat.toFixed(3)}, ${circuit.lng.toFixed(3)}`}
                      mono
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] italic" style={{ color: TEXT_MUTED }}>
        {label}
      </span>
      <span
        className="text-[14px] leading-none"
        style={{
          color: TEXT_PRIMARY,
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FrameEffects() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent 5%, rgba(160,120,240,0.18) 30%, rgba(255,255,255,0.14) 50%, rgba(160,120,240,0.18) 70%, transparent 95%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-28"
        style={{
          background:
            "linear-gradient(to bottom, rgba(140,100,220,0.05), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px"
        style={{
          background:
            "linear-gradient(to bottom, rgba(160,120,240,0.12), rgba(255,255,255,0.04) 50%, transparent 80%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-px"
        style={{
          background:
            "linear-gradient(to bottom, rgba(160,120,240,0.12), rgba(255,255,255,0.04) 50%, transparent 80%)",
        }}
      />
    </>
  );
}
