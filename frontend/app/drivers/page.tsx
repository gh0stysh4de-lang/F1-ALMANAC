"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlmanacHeader } from "@/components/almanac-header";
import { DriverSearch } from "@/components/driver-search";
import { GlassPanel } from "@/components/glass-panel";
import { nationalityFlagUrl } from "@/lib/nationality-flags";
import { TeamCareerTimeline } from "@/components/team-career-timeline";
import type { TeamTimelineStint } from "@/components/team-career-timeline";
import { CircuitMasteryHeatmap } from "@/components/circuit-mastery-heatmap";
import type { CircuitStat } from "@/components/circuit-mastery-heatmap";
import { TeammateBattles } from "@/components/teammate-battles";
import type { TeammateBattleSeason } from "@/components/teammate-battles";
import { DriverPhoto } from "@/components/driver-photo";
import { DriverPicker } from "@/components/driver-picker";

type DriverStats = {
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  polesQualifying: number;
  starts: number;
  points: number;
};

type DriverProfile = {
  id: number;
  name: string;
  code: string | null;
  number: number | null;
  nationality: string | null;
  dob: string | null;
  url: string | null;
  description: string | null;
  stats: DriverStats;
};

type TimelineData = {
  stints: TeamTimelineStint[];
  seasonPositions: Record<
    number,
    {
      position: number | null;
      isLive?: boolean;
    }
  >;
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.88)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.48)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";

const CAREER_STATS: {
  label: string;
  key: keyof DriverStats;
}[] = [
  { label: "Titles", key: "titles" },
  { label: "Wins", key: "wins" },
  { label: "Podiums", key: "podiums" },
  { label: "Poles", key: "poles" },
  { label: "Starts", key: "starts" },
  { label: "Points", key: "points" },
] as const;

// Points can be fractional because of half-points eras and sprint formats.
function formatStat(key: keyof DriverStats, value: number): string {
  if (key === "points") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  return String(value);
}

const TRANSITION_MS = 200;
const MINIMUM_LOADING_MS = 280;
const VISUAL_SETTLE_MS = 80;

export default function DriversPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [battles, setBattles] = useState<TeammateBattleSeason[] | null>(null);
  const [circuits, setCircuits] = useState<CircuitStat[] | null>(null);
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

  const handleDriverSelect = useCallback((id: number) => {
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);

    setContentVisible(false);

    selectionTimerRef.current = setTimeout(() => {
      setSelectedId(id);
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
    if (selectedId === null) {
      setProfile(null);
      setTimeline(null);
      setPhotoUrl(null);
      setBattles(null);
      setCircuits(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setProfile(null);
    setTimeline(null);
    setPhotoUrl(null);
    setBattles(null);
    setCircuits(null);

    const readJson = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      return response.ok ? response.json() : null;
    };

    const loadDriver = async () => {
      const startedAt = performance.now();

      try {
        const [
          profilePayload,
          timelinePayload,
          photoPayload,
          battlesPayload,
          circuitsPayload,
        ] = await Promise.all([
          readJson(`/api/driver?id=${selectedId}`),
          readJson(`/api/driver-timeline?id=${selectedId}`),
          readJson(`/api/driver-photo?id=${selectedId}`),
          readJson(`/api/teammate-battles?id=${selectedId}`),
          readJson(`/api/circuit-mastery?id=${selectedId}`),
        ]);

        const remainingDelay = Math.max(
          0,
          MINIMUM_LOADING_MS - (performance.now() - startedAt)
        );

        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }

        if (controller.signal.aborted) return;

        setProfile(profilePayload as DriverProfile | null);
        setTimeline(timelinePayload as TimelineData | null);
        setPhotoUrl((photoPayload?.photoUrl as string | null) ?? null);
        setBattles(
          (battlesPayload?.seasons as TeammateBattleSeason[] | null) ?? []
        );
        setCircuits(
          (circuitsPayload?.circuits as CircuitStat[] | null) ?? []
        );
        setLoading(false);
        revealContent(VISUAL_SETTLE_MS);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        setProfile(null);
        setTimeline(null);
        setPhotoUrl(null);
        setBattles([]);
        setCircuits([]);
        setLoading(false);
        revealContent(VISUAL_SETTLE_MS);
      }
    };

    void loadDriver();

    return () => controller.abort();
  }, [selectedId, revealContent]);

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
              variant="drivers"
              rightSlot={
                <DriverSearch
                  selectedId={selectedId}
                  onSelect={handleDriverSelect}
                />
              }
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
              {selectedId === null ? (
                <DriverPicker onSelect={handleDriverSelect} />
              ) : (
                <DriverDashboard
                  key={selectedId}
                  profile={profile}
                  loading={loading}
                  timeline={timeline}
                  photoUrl={photoUrl}
                  battles={battles}
                  circuits={circuits}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
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

function CircuitMasteryInfo() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="How Circuit Mastery is calculated"
        aria-describedby="circuit-mastery-tooltip"
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
        id="circuit-mastery-tooltip"
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[26px] z-[200] w-[300px] translate-y-1 rounded-lg border border-white/10 px-3 py-2.5 text-left opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{
          background: "rgba(12, 13, 32, 1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        }}
      >
        <p className="text-[10px] font-semibold italic text-white/90">
          How Circuit Mastery is calculated
        </p>

        <p className="mt-1.5 text-[9px] leading-[1.45] text-white/65">
          Circuit Mastery measures how successful a driver is at each circuit.
          It&apos;s not just a win rate &mdash; it&apos;s a composite score that
          combines the <span className="text-white/85">quality</span> of their
          performances with the <span className="text-white/85">scale</span> of
          their achievements.
        </p>

        <div className="mt-2 space-y-1.5 text-[9px] leading-[1.4] text-white/65">
          <p>
            <span className="text-white/85">Efficiency (60%) </span>
            &mdash; how close the driver came to the maximum score available
            here. Rewards consistently strong weekends.
          </p>

          <p>
            <span className="text-white/85">Dominance (40%) </span>
            &mdash; their wins, podiums and poles here, relative to their
            strongest circuit. Rewards outright achievement.
          </p>
        </div>

        <p className="mt-2 text-[9px] leading-[1.4] text-white/55">
          <span className="text-white/75">Weekend score:</span> race (P1 10 …
          P10 1), pole +5, fastest lap +1, sprint (P1 +3 / P2 +2 / P3 +1).
        </p>

        <p className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-[1.45] text-white/50">
          Scores are smoothed for sample size, so a few standout weekends
          don&apos;t outweigh sustained performance. Each era is judged only on
          the data it had &mdash; qualifying from 1994, sprints from 2021.
        </p>
      </div>
    </div>
  );
}

function TeammateBattlesInfo() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="How Teammate Battles are calculated"
        aria-describedby="teammate-battles-tooltip"
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
        id="teammate-battles-tooltip"
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[26px] z-[200] w-[300px] translate-y-1 rounded-lg border border-white/10 px-3 py-2.5 text-left opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{
          background: "rgba(12, 13, 32, 1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        }}
      >
        <p className="text-[10px] font-semibold italic text-white/90">
          How Teammate Battles are calculated
        </p>

        <p className="mt-1.5 text-[9px] leading-[1.45] text-white/65">
          Each season compares the driver head-to-head against every teammate
          he shared the car with, combined into one tally.
        </p>

        <div className="mt-2 space-y-1 text-[9px] leading-[1.4] text-white/65">
          <p>
            <span className="text-white/85">Race H2H:</span> counts only races
            where both classified &mdash; whoever finished ahead wins that duel.
          </p>

          <p>
            <span className="text-white/85">Qualifying H2H:</span> whoever set
            the higher grid position across every shared session.
          </p>
        </div>

        <p className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-[1.45] text-white/50">
          Qualifying data starts in 1994, so earlier seasons show race duels
          only.
        </p>
      </div>
    </div>
  );
}

function DriverDashboard({
  profile,
  loading,
  timeline,
  photoUrl,
  battles,
  circuits,
}: {
  profile: DriverProfile | null;
  loading: boolean;
  timeline: TimelineData | null;
  photoUrl: string | null;
  battles: TeammateBattleSeason[] | null;
  circuits: CircuitStat[] | null;
}) {
  const name = loading
    ? "Loading…"
    : profile?.name ?? "Driver profile";

  const metadata = [
    profile?.nationality,
    profile?.dob ? `Born ${profile.dob}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex h-[768px] flex-col gap-4"
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      <section className="grid h-[221px] shrink-0 grid-cols-[180px_minmax(0,1fr)] gap-4">
        <GlassPanel
          glowLevel="medium"
          className="flex h-full flex-col"
          bodyClassName="!flex !h-full !flex-1 !flex-col !items-center !justify-center !p-4"
        >
          <DriverPhoto
            photoUrl={photoUrl}
            name={profile?.name ?? "Driver photo"}
          />

          <span
            className="mt-3 text-[11px] italic"
            style={{ color: TEXT_MUTED }}
          >
            Photo via Wikipedia
          </span>
        </GlassPanel>

        <GlassPanel
          glowLevel="medium"
          className="flex h-full flex-col"
          bodyClassName="!flex !h-full !flex-1 !flex-col !justify-start !px-6 !py-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <h1
              className="truncate text-[28px] font-bold tracking-tight"
              style={{ color: TEXT_PRIMARY }}
            >
              {name}
            </h1>

            {profile?.number !== null &&
              profile?.number !== undefined && (
                <span
                  className="flex h-[20px] items-center rounded-md border border-white/12 bg-white/[0.05] px-2.5 text-[13px] font-semibold leading-none"
                  style={{ color: "rgba(199,197,208,0.70)" }}
                >
                  #{profile.number}
                </span>
              )}
          </div>

          <p
            className="mt-2 line-clamp-4 max-w-none text-[15px] italic leading-relaxed"
            style={{
              color: TEXT_SECONDARY,
              minHeight: "calc(1.625em * 4)",
            }}
          >
            {profile?.description ??
              "No career biography available for this driver yet."}
          </p>

          <p
            className="mt-auto flex items-center gap-2 text-[13px]"
            style={{
              color: TEXT_MUTED,
              minHeight: "1.5em",
            }}
          >
            {profile?.nationality &&
              nationalityFlagUrl(profile.nationality) && (
                <img
                  src={nationalityFlagUrl(profile.nationality)!}
                  alt={`${profile.nationality} flag`}
                  className="h-[11px] w-[16px] shrink-0 rounded-[1px] object-cover opacity-90"
                />
              )}

            <span>
              {metadata ||
                "Career years and profile details will appear here."}
            </span>
          </p>
        </GlassPanel>
      </section>

      <section className="grid h-[76px] shrink-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {CAREER_STATS.map(({ label, key }) => {
          const stats = profile?.stats;

          const display =
            loading || !stats
              ? "—"
              : formatStat(key, stats[key]);

          const polesTitle =
            key === "poles" && stats
              ? `${stats.polesQualifying} pole positions in qualifying`
              : undefined;

          return (
            <GlassPanel
              key={label}
              glowLevel="soft"
              className="flex h-full flex-col"
              bodyClassName="!flex !h-full !flex-1 !flex-col !items-center !justify-center !p-3"
            >
              <span
                className="text-[13px]"
                style={{ color: TEXT_SECONDARY }}
                title={polesTitle}
              >
                {label}
              </span>

              <span
                className="mt-1 text-[22px] font-bold leading-none"
                style={{ color: TEXT_PRIMARY }}
              >
                {display}
              </span>
            </GlassPanel>
          );
        })}
      </section>

      <GlassPanel
        glowLevel="medium"
        className="flex h-[136px] shrink-0 flex-col"
        bodyClassName="!flex !min-h-0 !flex-1 !flex-col !justify-center !px-6 !pt-2 !pb-3"
      >
        <h2
          className="m-0 mb-[14px] text-center text-[11px] font-semibold italic tracking-[0.3px]"
          style={{ color: "rgba(199, 197, 208, 0.65)" }}
        >
          Teams &amp; Career Timeline
        </h2>

        <TeamCareerTimeline
          stints={timeline?.stints ?? []}
          seasonPositions={timeline?.seasonPositions ?? {}}
        />
      </GlassPanel>

      <section className="grid h-[287px] min-h-[287px] shrink-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <GlassPanel
          title="Teammate Battles"
          glowLevel="soft"
          className="relative flex h-full min-h-0 min-w-0 flex-col"
          bodyClassName="!flex !min-h-0 !min-w-0 !flex-1 !flex-col !px-3 !pb-4"
        >
          <div className="absolute left-[19px] top-[17px] z-[150]">
            <TeammateBattlesInfo />
          </div>

          <TeammateBattles
            driverCode={profile?.code ?? "DRV"}
            seasons={battles ?? []}
            loading={battles === null}
          />
        </GlassPanel>

        <GlassPanel
          title="Circuit Mastery"
          glowLevel="soft"
          className="relative flex h-full min-h-0 min-w-0 flex-col"
          bodyClassName="!flex !min-h-0 !min-w-0 !flex-1 !flex-col !px-5 !pb-5"
        >
          <div className="absolute left-4 top-[17px] z-[150]">
            <CircuitMasteryInfo />
          </div>

          <CircuitMasteryHeatmap circuits={circuits ?? []} loading={circuits === null} />
        </GlassPanel>
      </section>
    </div>
  );
}