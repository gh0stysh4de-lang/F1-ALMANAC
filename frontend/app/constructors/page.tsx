"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlmanacHeader } from "@/components/almanac-header";
import { ConstructorSearch } from "@/components/constructor-search";
import { GlassPanel } from "@/components/glass-panel";
import { nationalityFlagUrl } from "@/lib/nationality-flags";
import { teamColor } from "@/lib/team-colors";
import { ConstructorBadge } from "@/components/constructor-badge";
import { ConstructorPicker } from "@/components/constructor-picker";

type ConstructorStats = {
  titles: number;
  wins: number;
  podiums: number;
  poles: number;
  races: number;
  points: number;
};

type ConstructorProfile = {
  id: number;
  name: string;
  ref: string | null;
  nationality: string | null;
  url: string | null;
  firstYear: number | null;
  lastYear: number | null;
  stats: ConstructorStats;
};

type SeasonDriver = { name: string; code: string | null };

type SeasonEntry = {
  year: number;
  position: number | null;
  points: number;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  winRate: number;
  podiumRate: number;
  poleRate: number;
  pointsRate: number;
  drivers: SeasonDriver[];
  isLive: boolean;
};

type DriverEntry = {
  id: number;
  name: string;
  code: string | null;
  nationality: string | null;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  years: string;
};

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.88)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.48)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.30)";

// Championship-position colours: gold / silver / bronze for the podium places,
// plain secondary text for everything else. Shared by the trajectory bar
// labels and the season hover card so the two can't drift apart.
function positionLabelColor(position: number | null): string {
  if (position === 1) return "#D4AF37";
  if (position === 2) return "#C0C0C0";
  if (position === 3) return "#CD7F32";
  return TEXT_SECONDARY;
}
const PURPLE = "rgba(160, 120, 240, 0.9)";

const CAREER_STATS: { label: string; key: keyof ConstructorStats }[] = [
  { label: "Titles", key: "titles" },
  { label: "Wins", key: "wins" },
  { label: "Podiums", key: "podiums" },
  { label: "Poles", key: "poles" },
  { label: "Races", key: "races" },
  { label: "Points", key: "points" },
] as const;

function formatStat(key: keyof ConstructorStats, value: number): string {
  if (key === "points") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

export default function ConstructorsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profile, setProfile] = useState<ConstructorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonEntry[] | null>(null);
  const [drivers, setDrivers] = useState<DriverEntry[] | null>(null);
  const [description, setDescription] = useState<string | null>(null);
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

  const handleConstructorSelect = useCallback((id: number) => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }

    // Start the exit transition immediately, while the current content is still visible.
    setContentVisible(false);

    selectionTimerRef.current = setTimeout(() => {
      setSelectedId(id);
      selectionTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    revealContent();

    return () => {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
      }
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
    };
  }, [revealContent]);

  useEffect(() => {
    if (selectedId === null) {
      setProfile(null);
      setSeasons(null);
      setDrivers(null);
      setDescription(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    const minimumLoadingTime = 280;
    const visualSettleTime = 80;

    setLoading(true);
    setProfile(null);
    setSeasons(null);
    setDrivers(null);
    setDescription(null);

    const readJson = async (url: string) => {
      const response = await fetch(url, { signal: ctrl.signal });
      return response.ok ? response.json() : null;
    };

    const loadConstructor = async () => {
      const startedAt = performance.now();

      try {
        const [profilePayload, seasonsPayload, driversPayload, descriptionPayload] =
          await Promise.all([
            readJson(`/api/constructor?id=${selectedId}`),
            readJson(`/api/constructor-seasons?id=${selectedId}`),
            readJson(`/api/constructor-drivers?id=${selectedId}`),
            readJson(`/api/constructor-description?id=${selectedId}`),
          ]);

        const remainingDelay = Math.max(
          0,
          minimumLoadingTime - (performance.now() - startedAt)
        );

        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }

        if (ctrl.signal.aborted) return;

        // Commit every dataset in one render so all visualisations reveal together.
        setProfile(profilePayload as ConstructorProfile | null);
        setSeasons(
          (seasonsPayload?.seasons as SeasonEntry[] | null) ?? []
        );
        setDrivers(
          (driversPayload?.drivers as DriverEntry[] | null) ?? []
        );
        setDescription(
          (descriptionPayload?.description as string | null) ?? null
        );
        setLoading(false);
        revealContent(visualSettleTime);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        setProfile(null);
        setSeasons([]);
        setDrivers([]);
        setDescription(null);
        setLoading(false);
        revealContent(visualSettleTime);
      }
    };

    void loadConstructor();

    return () => ctrl.abort();
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
              variant="constructors"
              rightSlot={
                <ConstructorSearch
                  selectedId={selectedId}
                  onSelect={handleConstructorSelect}
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
                transition:
                  "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
                pointerEvents: contentVisible ? "auto" : "none",
              }}
            >
              {selectedId === null ? (
                <ConstructorPicker onSelect={handleConstructorSelect} />
              ) : (
                <ConstructorDashboard
                  key={selectedId}
                  profile={profile}
                  loading={loading}
                  seasons={seasons}
                  drivers={drivers}
                  description={description}
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

function ConstructorDashboard({
  profile,
  loading,
  seasons,
  drivers,
  description,
}: {
  profile: ConstructorProfile | null;
  loading: boolean;
  seasons: SeasonEntry[] | null;
  drivers: DriverEntry[] | null;
  description: string | null;
}) {
  const name = loading ? "Loading…" : profile?.name ?? "Constructor profile";
  const accent = teamColor(profile?.ref, profile?.lastYear ?? undefined);

  // A team whose last season is the current one is still racing — show
  // "present" rather than a year that will look stale mid-season.
  const currentYear = new Date().getFullYear();
  const lastYearLabel =
    profile?.lastYear != null && profile.lastYear >= currentYear
      ? "present"
      : String(profile?.lastYear ?? "");

  const activeYears =
    profile?.firstYear != null
      ? profile.firstYear === profile.lastYear
        ? `${profile.firstYear}`
        : `${profile.firstYear}\u2013${lastYearLabel}`
      : null;

  const subtitle = [
    activeYears ? `Active ${activeYears}` : null,
    profile ? `${profile.stats.races} race entries` : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  const metadata = [profile?.nationality, activeYears]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div
      className="flex h-[768px] flex-col gap-4"
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      {/* Identity header */}
      <section className="grid h-[168px] shrink-0 grid-cols-[180px_minmax(0,1fr)] gap-4">
        <GlassPanel
          glowLevel="medium"
          className="flex h-full flex-col"
          bodyClassName="!flex !h-full !flex-1 !flex-col !items-center !justify-center !p-4"
        >
          <ConstructorBadge
            constructorRef={profile?.ref ?? null}
            name={profile?.name ?? ""}
            accent={accent}
          />
        </GlassPanel>

        <GlassPanel
          glowLevel="medium"
          className="flex h-full flex-col"
          bodyClassName="!flex !h-full !flex-1 !flex-col !justify-center !px-6 !pt-6 !pb-7"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="h-[26px] w-[4px] shrink-0 rounded-full"
              style={{ background: accent }}
            />
            <h1
              className="truncate text-[28px] font-bold tracking-tight"
              style={{ color: TEXT_PRIMARY }}
            >
              {name}
            </h1>
          </div>

          {/* Wikipedia intros vary in length, so the route trims to a
              character budget at a sentence boundary. Type is sized so four
              lines fit the panel; line-clamp is the safety net beyond that.
              minHeight pins the block to that same four-line ceiling at all
              times: without it, a one-line "Loading…" placeholder, a
              two-line intro for one team and a four-line intro for another
              each render at a different height, so the panel visibly resizes
              on every constructor switch. */}
          <p
            className="mt-1.5 line-clamp-4 text-[12.5px] italic leading-[1.4]"
            style={{ color: TEXT_SECONDARY, minHeight: "calc(1.4em * 3)" }}
          >
            {loading
              ? "Loading team history…"
              : // Prefer the sourced Wikipedia summary; fall back to the plain
                // facts only when the team has no usable article intro.
                description ??
                subtitle ??
                "Team profile details will appear here."}
          </p>

          {/* minHeight for the same reason as the description above: the flag
              is conditional (not every nationality resolves to one), and an
              img present vs absent changes this row's line box, so pinning it
              keeps the panel stable regardless. */}
          <p
            className="mt-auto flex items-center gap-2 text-[13px]"
            style={{ color: TEXT_MUTED, minHeight: "1.5em" }}
          >
            {profile?.nationality &&
              nationalityFlagUrl(profile.nationality) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nationalityFlagUrl(profile.nationality)!}
                  alt={`${profile.nationality} flag`}
                  className="h-[11px] w-[16px] shrink-0 rounded-[1px] object-cover opacity-90"
                />
              )}
            <span>
              {metadata || "Nationality and active years will appear here."}
            </span>
          </p>
        </GlassPanel>
      </section>

      {/* Stat strip */}
      {/* Stat strip — kept identical to the Drivers page so the two profile
          pages line up: same height, same responsive breakpoints. */}
      <section className="grid h-[76px] shrink-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {CAREER_STATS.map(({ label, key }) => {
          const stats = profile?.stats;
          const display = loading || !stats ? "—" : formatStat(key, stats[key]);
          return (
            <GlassPanel
              key={label}
              glowLevel="soft"
              className="flex h-full flex-col"
              bodyClassName="!flex !h-full !flex-1 !flex-col !items-center !justify-center !p-3"
            >
              <span className="text-[13px]" style={{ color: TEXT_SECONDARY }}>
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

      {/* Lower area: left = full-height drivers, right = trajectory + performance.
          Left column is sized to line up under ~the first two KPI cards, wide
          enough for a driver name plus the four stat columns. */}
      <section className="grid h-[492px] min-h-[492px] shrink-0 grid-cols-1 gap-4 lg:grid-cols-6">
        {/* Left column: top drivers, aligned with the first two KPI cards */}
        <GlassPanel
          title="Top Drivers"
          glowLevel="soft"
          className="flex h-full min-h-0 flex-col lg:col-span-2"
          bodyClassName="!flex !min-h-0 !flex-1 !flex-col !px-2 !pb-4 !pt-1"
        >
          <NotableDrivers
            drivers={drivers ?? []}
            accent={accent}
            loading={loading}
          />
        </GlassPanel>

        {/* Right column: trajectory (shorter) over performance (taller) */}
        <div className="flex h-full min-h-0 flex-col gap-4 lg:col-span-4">
          <GlassPanel
            title="Championship Trajectory"
            glowLevel="medium"
            className="flex h-[299px] min-h-[299px] shrink-0 flex-col"
            bodyClassName="!flex !min-h-0 !flex-1 !flex-col !px-5 !pb-4 !pt-2"
          >
            <ChampionshipTrajectory
              seasons={seasons ?? []}
              accent={accent}
              teamName={profile?.name ?? ""}
              loading={loading}
            />
          </GlassPanel>

          <GlassPanel
            title="Performance Profile"
            glowLevel="soft"
            className="flex h-[177px] min-h-[177px] shrink-0 flex-col"
            bodyClassName="!flex !min-h-0 !flex-1 !flex-col !px-5 !pb-4 !pt-1"
          >
            {/* Positioned relative to GlassPanel's own <section> (the nearest
                positioned ancestor) rather than the `action` prop, which
                always anchors top-right — this needs the mirror position,
                top-4 left-4. */}
            <div className="absolute left-4 top-4 z-[200]">
              <PerformanceInfo />
            </div>
            <PerformanceProfile
              seasons={seasons ?? []}
              accent={accent}
              loading={loading}
            />
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Championship Trajectory: season bars whose height reflects finishing
// position (P1 tall), with a portal hover card showing the full season detail.
// ---------------------------------------------------------------------------
function ChampionshipTrajectory({
  seasons,
  accent,
  teamName,
  loading,
}: {
  seasons: SeasonEntry[];
  accent: string;
  teamName: string;
  loading: boolean;
}) {
  const [hover, setHover] = useState<{
    season: SeasonEntry;
    x: number;
    y: number;
  } | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        Loading championship history…
      </div>
    );
  }
  if (seasons.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        No championship history available.
      </div>
    );
  }

  // Bar height scales inversely with position. P1 = full; clamp scale at 12th.
  const MAX_POS = 12;
  const barHeight = (pos: number | null): number => {
    if (pos === null) return 6;
    const clamped = Math.min(pos, MAX_POS);
    return 100 - ((clamped - 1) / (MAX_POS - 1)) * 84; // 100%..16%
  };

  // Show full years below the bars. For long histories, show every second year.
  const n = seasons.length;
  const labelEvery = n <= 28 ? 1 : 2;

  const barIntensity = (position: number | null): number => {
    if (position === null) return 28;

    const clamped = Math.min(Math.max(position, 1), MAX_POS);
    return Math.round(55 + ((MAX_POS - clamped) / (MAX_POS - 1)) * 45);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-[3px]">
        {seasons.map((s) => {
          const noChampionship = s.position === null;
          const h = barHeight(s.position);
          return (
            <div
              key={s.year}
              className="group/bar flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHover({ season: s, x: rect.left, y: rect.top });
              }}
              onMouseMove={(e) => {
                // Read layout synchronously: e.currentTarget is nulled out by
                // the time the async setHover updater runs (React reuses the
                // event object), so capture the value here first.
                const top = e.currentTarget.getBoundingClientRect().top;
                const clientX = e.clientX;
                setHover((prev) =>
                  prev ? { ...prev, x: clientX, y: top } : prev
                );
              }}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative mb-1 flex h-[10px] w-full items-center justify-center">
                {s.isLive && (
                  <span
                    aria-label="Live season"
                    className="absolute -top-[9px] left-1/2 h-[6px] w-[6px] -translate-x-1/2 rounded-full"
                    style={{
                      background: PURPLE,
                      boxShadow: `0 0 8px ${PURPLE}`,
                    }}
                  />
                )}

                <span
                  className="text-[8px] font-bold leading-none tabular-nums"
                  style={{ color: positionLabelColor(s.position) }}
                >
                  {s.position != null ? `P${s.position}` : "—"}
                </span>
              </div>

              <div
                className="relative w-full rounded-t-[3px] transition-all duration-150 group-hover/bar:brightness-125"
                style={{
                  height: `${h}%`,
                  minHeight: 3,
                  background: noChampionship
                    ? "rgba(255,255,255,0.08)"
                    : `color-mix(in srgb, ${accent} ${barIntensity(
                        s.position
                      )}%, transparent)`,
                }}
              >
              </div>
            </div>
          );
        })}
      </div>

      {/* Year timeline */}
      <div
        className="mt-2 flex items-center gap-[3px] border-t border-white/[0.06] pt-1.5 text-[8px]"
        style={{ color: TEXT_SECONDARY }}
      >
        {seasons.map((s, i) => (
          <span
            key={s.year}
            className="min-w-0 flex-1 whitespace-nowrap text-center tabular-nums"
            style={{
              opacity: i % labelEvery === 0 ? 1 : 0,
              overflow: "visible",
            }}
          >
            {s.year}
          </span>
        ))}
      </div>

      {hover &&
        portalRoot &&
        createPortal(
          <SeasonHoverCard
            season={hover.season}
            accent={accent}
            teamName={teamName}
            x={hover.x}
            y={hover.y}
          />,
          portalRoot
        )}
    </div>
  );
}

function SeasonHoverCard({
  season,
  accent,
  teamName,
  x,
  y,
}: {
  season: SeasonEntry;
  accent: string;
  teamName: string;
  x: number;
  y: number;
}) {
  const CARD_W = 240;
  // Keep the card on-screen horizontally; place it above the bar.
  const left = Math.min(
    Math.max(8, x - CARD_W / 2),
    (typeof window !== "undefined" ? window.innerWidth : 1400) - CARD_W - 8
  );
  const top = Math.max(8, y - 12);

  const posText =
    season.position != null
      ? `P${season.position} in Constructors' Championship`
      : season.year < 1958
        ? "No Constructors' Championship this era"
        : "Championship position unavailable";

  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg border border-white/10 p-3"
      style={{
        left,
        top,
        width: CARD_W,
        transform: "translateY(-100%)",
        background: "rgba(12, 13, 32, 1)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        fontFamily: "'Exo 2', sans-serif",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-white/90">
          {teamName} · {season.year}
        </span>
        {season.isLive && (
          <span
            className="rounded-[3px] px-1 py-[1px] text-[7px] font-bold uppercase leading-none"
            style={{
              color: PURPLE,
              background: "rgba(160,120,240,0.14)",
              border: `0.5px solid ${PURPLE}`,
            }}
          >
            Live
          </span>
        )}
      </div>

      <p
        className="mt-1.5 text-[11px] font-semibold"
        style={{ color: positionLabelColor(season.position) }}
      >
        {posText}
      </p>

      <p className="mt-1 text-[11px] leading-[1.45] text-white/65">
        <span className="text-white/90">
          {Number.isInteger(season.points)
            ? season.points
            : season.points.toFixed(1)}
        </span>{" "}
        pts · {season.wins} wins · {season.podiums} podiums · {season.poles}{" "}
        poles
      </p>

      {/* Rate context: raw counts alone don't say how dominant a season was —
          21 wins from 22 races is a different story from 21 across 40. */}
      {season.races > 0 && (
        <p className="mt-1 text-[10px] leading-[1.45] text-white/50">
          {season.races} {season.races === 1 ? "race" : "races"}
          {season.wins > 0 && (
            <>
              {" · won "}
              <span style={{ color: accent }}>
                {Math.round((season.wins / season.races) * 100)}%
              </span>
              {" of them"}
            </>
          )}
        </p>
      )}

      {season.drivers.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="text-[8px] uppercase tracking-wide text-white/50">
            Drivers
          </p>
          <p className="mt-0.5 text-[11px] leading-[1.45] text-white/65">
            {season.drivers.map((d) => d.name).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance Profile: a compact heatmap. Rows = rate metrics, columns =
// seasons, cell intensity = strength (rate 0..1). Answers "dominant by wins,
// podium consistency, qualifying pace, or points reliability?"
// ---------------------------------------------------------------------------
const METRIC_ROWS: { label: string; key: keyof SeasonEntry }[] = [
  { label: "Win", key: "winRate" },
  { label: "Podium", key: "podiumRate" },
  { label: "Pole", key: "poleRate" },
  { label: "Points", key: "pointsRate" },
];

function PerformanceProfile({
  seasons,
  accent,
  loading,
}: {
  seasons: SeasonEntry[];
  accent: string;
  loading: boolean;
}) {
  const [hover, setHover] = useState<{
    label: string;
    year: number;
    value: number;
  } | null>(null);

  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        Loading performance…
      </div>
    );
  }
  if (seasons.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        No performance data available.
      </div>
    );
  }

  const cellIntensity = (
    value: number,
    key: keyof SeasonEntry
  ): number => {
    if (key === "pointsRate") {
      return Math.round(18 + value * 82);
    }

    return Math.round(10 + Math.pow(value, 0.2) * 90);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-[3px]">
        {METRIC_ROWS.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span
              className="w-[46px] shrink-0 text-right text-[9px]"
              style={{ color: TEXT_SECONDARY }}
            >
              {row.label}
            </span>
            <div className="flex min-w-0 flex-1 gap-[2px]">
              {seasons.map((s) => {
                const v = s[row.key] as number;
                return (
                  <div
                    key={s.year}
                    className="h-[16px] min-w-0 flex-1 rounded-[2px] transition-transform hover:scale-y-125"
                    style={{
                      background:
                        v > 0
                          ? `color-mix(in srgb, ${accent} ${cellIntensity(
                              v,
                              row.key
                            )}%, transparent)`
                          : "rgba(255,255,255,0.03)",
                    }}
                    onMouseEnter={() =>
                      setHover({ label: row.label, year: s.year, value: v })
                    }
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Axis + hover readout */}
      <div
        className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-1.5 text-[9px]"
        style={{ color: TEXT_SECONDARY }}
      >
        <span className="tabular-nums">{seasons[0]?.year}</span>
        <span className="min-w-0 flex-1 truncate px-2 text-center">
          {hover
            ? `${hover.label} rate · ${hover.year} · ${Math.round(
                hover.value * 100
              )}%`
            : "Cell intensity = rate per race entry"}
        </span>
        <span className="tabular-nums">
          {seasons[seasons.length - 1]?.year}
        </span>
      </div>
    </div>
  );
}

function PerformanceInfo() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="How Performance Profile is calculated"
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
        className="pointer-events-none absolute left-0 top-[26px] z-[200] w-[280px] translate-y-1 rounded-lg border border-white/10 px-3 py-2.5 text-left opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{
          background: "rgba(12, 13, 32, 1)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.50)",
        }}
      >
        <p className="text-[10px] font-semibold italic text-white/90">
          How Performance Profile works
        </p>
        <p className="mt-1.5 text-[9px] leading-[1.45] text-white/65">
          Each cell is a rate — wins, podiums, poles or points-finishes divided
          by the team&apos;s race entries that season. Brighter = stronger.
        </p>
        <p className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-[1.45] text-white/50">
          Rates are used instead of raw totals so eras stay comparable despite
          changing points systems and calendar lengths.
        </p>
      </div>
    </div>
  );
}

// Below this many drivers, the list stacks at the top with fixed-height rows
// rather than spreading over the full panel — a lone driver floating in the
// middle of an empty panel reads as a layout bug.
const SPREAD_THRESHOLD = 5;
const COMPACT_ROW_H = 34;

function NotableDrivers({
  drivers,
  accent,
  loading,
}: {
  drivers: DriverEntry[];
  accent: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        Loading drivers…
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        No driver history available.
      </div>
    );
  }

  // Drivers are ranked by wins, then podiums, poles and race entries in the API.
  // Hide drivers who have no recorded results in any displayed metric.
  const shown = drivers
    .filter(
      (driver) =>
        driver.wins > 0 ||
        driver.podiums > 0 ||
        driver.poles > 0 ||
        driver.sprintWins > 0
    )
    .slice(0, 15);

  if (shown.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-[12px] italic"
        style={{ color: TEXT_MUTED }}
      >
        No ranked driver statistics available.
      </div>
    );
  }

  const maxima = {
    wins: Math.max(...shown.map((driver) => driver.wins), 0),
    podiums: Math.max(...shown.map((driver) => driver.podiums), 0),
    poles: Math.max(...shown.map((driver) => driver.poles), 0),
    sprintWins: Math.max(...shown.map((driver) => driver.sprintWins), 0),
  };
  const tableColumns =
    "grid-cols-[minmax(140px,1.65fr)_repeat(4,minmax(48px,0.72fr))]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`mb-1 grid ${tableColumns} items-end gap-x-2 px-2`}
        aria-hidden="true"
      >
        <div className="grid grid-cols-[20px_minmax(0,1fr)] items-end gap-x-[7px]">
          <span aria-hidden="true" />
          <span
            className="text-center text-[8px] font-semibold italic tracking-[0.08em]"
            style={{ color: TEXT_MUTED }}
          >
            Driver
          </span>
        </div>
        <span
          className="text-center text-[8px] font-semibold italic tracking-[0.08em]"
          style={{ color: TEXT_MUTED }}
        >
          Wins
        </span>
        <span
          className="text-center text-[8px] font-semibold italic tracking-[0.08em]"
          style={{ color: TEXT_MUTED }}
        >
          Podiums
        </span>
        <span
          className="text-center text-[8px] font-semibold italic tracking-[0.08em]"
          style={{ color: TEXT_MUTED }}
        >
          Poles
        </span>
        <span
          className="whitespace-nowrap text-center text-[8px] font-semibold italic tracking-[0.04em]"
          style={{ color: TEXT_MUTED }}
        >
          Sprint Wins
        </span>
      </div>

      {/* Long lists stretch to fill the panel; short ones would look odd with
          a single row centred in all that space, so below the threshold rows
          take their natural height and stack from the top. */}
      <div
        className="grid min-h-0 flex-1 gap-[1px] pb-0"
        style={
          shown.length >= SPREAD_THRESHOLD
            ? {
                gridTemplateRows: `repeat(${shown.length}, minmax(0, 1fr))`,
              }
            : {
                gridTemplateRows: `repeat(${shown.length}, ${COMPACT_ROW_H}px)`,
                alignContent: "start",
              }
        }
      >
        {shown.map((driver, index) => (
          <div
            key={driver.id}
            className={`grid ${
              shown.length >= SPREAD_THRESHOLD ? "h-full" : ""
            } ${tableColumns} items-center gap-x-2 rounded-[5px] px-2 py-[2px] transition-colors hover:bg-white/[0.04]`}
          >
            <div className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-center gap-x-[7px]">
              <span
                className="text-center text-[8px] font-semibold tabular-nums"
                style={{ color: TEXT_MUTED }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="flex min-w-0 flex-col">
                <span
                  className="truncate text-[11px] font-medium leading-tight"
                  style={{ color: TEXT_PRIMARY }}
                >
                  {driver.name}
                </span>
                <span
                  className="truncate text-[8px] leading-tight"
                  style={{ color: TEXT_SECONDARY }}
                >
                  {driver.years}
                </span>
              </div>
            </div>

            <DriverStat
              value={driver.wins}
              maximum={maxima.wins}
              accent={accent}
            />
            <DriverStat
              value={driver.podiums}
              maximum={maxima.podiums}
              accent={accent}
            />
            <DriverStat
              value={driver.poles}
              maximum={maxima.poles}
              accent={accent}
            />
            <DriverStat
              value={driver.sprintWins}
              maximum={maxima.sprintWins}
              accent={accent}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DriverStat({
  value,
  maximum,
  accent,
}: {
  value: number;
  maximum: number;
  accent: string;
}) {
  const share = maximum > 0 ? Math.max(0, Math.min(100, (value / maximum) * 100)) : 0;

  return (
    <div className="relative flex h-[20px] min-w-0 items-center justify-center overflow-hidden rounded-[4px]">
      {value > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[2px] left-0 rounded-[3px]"
          style={{
            width: `${share}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 17%, transparent), color-mix(in srgb, ${accent} 5%, transparent))`,
            boxShadow: `inset 0 1px 0 color-mix(in srgb, ${accent} 11%, transparent)`,
          }}
        />
      )}

      <span
        className="relative z-10 text-center text-[10px] font-semibold leading-none tabular-nums"
        style={{
          color: value === 0 ? TEXT_MUTED : TEXT_PRIMARY,
        }}
      >
        {value}
      </span>
    </div>
  );
}
