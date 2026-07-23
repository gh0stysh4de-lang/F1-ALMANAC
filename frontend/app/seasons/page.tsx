"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlmanacHeader } from "@/components/almanac-header";
import { GlassPanel } from "@/components/glass-panel";
import { PilotStandings } from "@/components/pilot-standings";
import { RaceResultsMatrix } from "@/components/race-results-matrix";
import { CumulativeDynamics } from "@/components/cumulative-dynamics";
import { PodiumsTable } from "@/components/podiums-table";
import { SeasonPicker } from "@/components/season-picker";

const TRANSITION_MS = 200;
const DASHBOARD_REVEAL_DELAY_MS = 480;

export default function SeasonsPage() {
  const [season, setSeason] = useState<number | null>(null);
  const [mode, setMode] = useState<"drivers" | "constructors">("drivers");
  const [contentVisible, setContentVisible] = useState(false);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealContent = useCallback((delay = 0) => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

    revealTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setContentVisible(true));
      });
    }, delay);
  }, []);

  useEffect(() => {
    revealContent();

    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [revealContent]);

  const handleSeasonSelect = useCallback(
    (nextSeason: number) => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);

      setContentVisible(false);

      selectionTimerRef.current = setTimeout(() => {
        setSeason(nextSeason);
        selectionTimerRef.current = null;
        revealContent(DASHBOARD_REVEAL_DELAY_MS);
      }, TRANSITION_MS);
    },
    [revealContent]
  );

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
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

          <div className="relative z-[200] shrink-0">
            <AlmanacHeader
              season={season ?? undefined}
              onSeasonChange={handleSeasonSelect}
              mode={mode}
              onModeChange={setMode}
            />
          </div>

          <div className="relative z-0 flex min-h-0 flex-1 flex-col p-4 sm:p-5">
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
              {season === null ? (
                <SeasonPicker onSelect={handleSeasonSelect} />
              ) : (
                <div
                  key={season}
                  className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[3fr_7fr]"
                >
                  <GlassPanel
                    title="Standings"
                    glowLevel="medium"
                    className="flex h-[650px] flex-col"
                    bodyClassName="!pl-5 !pr-6 !pb-3 flex min-h-0 flex-1 flex-col"
                  >
                    <PilotStandings season={season} mode={mode} />
                  </GlassPanel>

                  <div className="flex h-[650px] flex-col gap-4">
                    <div className="grid h-[200px] shrink-0 grid-cols-2 gap-4">
                      <GlassPanel
                        title="Top 5 Cumulative Points"
                        glowLevel="medium"
                        className="flex flex-col"
                        bodyClassName="!pl-3 !pr-3 !pb-1 flex flex-1 flex-col"
                      >
                        <CumulativeDynamics season={season} mode={mode} />
                      </GlassPanel>

                      <GlassPanel
                        title="Podiums"
                        glowLevel="medium"
                        className="flex flex-col"
                        bodyClassName="!px-4.5 !pb-3 flex flex-1 flex-col"
                      >
                        <PodiumsTable season={season} entity={mode} />
                      </GlassPanel>
                    </div>

                    <GlassPanel
                      title="Race-by-Race Results"
                      glowLevel="soft"
                      className="flex h-[434px] flex-col"
                      bodyClassName="!px-5 !pt-2 !pb-4 flex min-h-0 flex-1 flex-col"
                    >
                      <RaceResultsMatrix season={season} mode={mode} />
                    </GlassPanel>
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
