"use client";

import { useState } from "react";
import { CosmicBackground } from "@/components/cosmic-background";
import { AlmanacHeader } from "@/components/almanac-header";
import { GlassPanel } from "@/components/glass-panel";
import { PilotStandings } from "@/components/pilot-standings";
import { RaceResultsMatrix } from "@/components/race-results-matrix";
import { CumulativeDynamics } from "@/components/cumulative-dynamics";
import { PodiumsTable } from "@/components/podiums-table";

export default function SeasonsPage() {
  const [season, setSeason] = useState(2024);
  const [mode, setMode] = useState<"drivers" | "constructors">("drivers");

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background: [
          "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(22,18,45,1), transparent)",
          "radial-gradient(ellipse 60% 40% at 80% 20%, rgba(30,15,50,0.6), transparent)",
          "radial-gradient(ellipse 50% 50% at 15% 80%, rgba(20,12,40,0.5), transparent)",
          "radial-gradient(ellipse 40% 30% at 70% 70%, rgba(10,8,30,0.8), transparent)",
          "radial-gradient(circle at 50% 50%, rgba(12,10,28,1), rgba(5,5,15,1))",
        ].join(", "),
      }}
    >
      <CosmicBackground />

      <div className="relative z-10 flex min-h-screen w-full items-start justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div
          className="relative w-full max-w-[1400px] overflow-hidden rounded-[12px]"
          style={{
            minHeight: 800,
            background: "rgba(180, 180, 210, 0.02)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "0.5px solid rgba(255, 255, 255, 0.12)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Top edge glow */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent 5%, rgba(160,120,240,0.18) 30%, rgba(255,255,255,0.14) 50%, rgba(160,120,240,0.18) 70%, transparent 95%)",
            }}
          />

          {/* Top glow bloom */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-28"
            style={{
              background:
                "linear-gradient(to bottom, rgba(140,100,220,0.05), transparent)",
            }}
          />

          {/* Left edge highlight */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, rgba(160,120,240,0.12), rgba(255,255,255,0.04) 50%, transparent 80%)",
            }}
          />

          {/* Right edge highlight */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, rgba(160,120,240,0.12), rgba(255,255,255,0.04) 50%, transparent 80%)",
            }}
          />

          {/* Header */}
          <div className="relative z-[200]">
            <AlmanacHeader
              season={season}
              onSeasonChange={setSeason}
              mode={mode}
              onModeChange={setMode}
            />
          </div>

          {/* Seasons content */}
          <div className="relative z-0 grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[3fr_7fr]">
            {/* Left column — Pilot Standings */}
            <GlassPanel
              title="Standings"
              glowLevel="medium"
              className="flex flex-col"
              bodyClassName="!pl-5 !pr-5.5 !pb-4 flex flex-1 flex-col"
            >
              <PilotStandings season={season} mode={mode} />
            </GlassPanel>

            {/* Right column */}
            <div className="flex min-h-[636px] flex-col gap-4">
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
                className="flex min-h-[420px] flex-1 flex-col"
                bodyClassName="!px-5 !pt-2 !pb-5 flex flex-1 flex-col"
              >
                <RaceResultsMatrix season={season} mode={mode} />
              </GlassPanel>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}