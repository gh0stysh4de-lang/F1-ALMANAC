'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Seasons', href: '/seasons', enabled: true },
  { label: 'Drivers', href: '/drivers', enabled: true },
  { label: 'Constructors', href: '/constructors', enabled: true },
  { label: 'Circuits', href: '/circuits', enabled: true },
  { label: 'Credits', href: '/credits', enabled: true },
] as const

type SeasonMeta = {
  title: string
  description: string
  live: boolean
  stats: {
    rounds: number
    drivers: number
    teams: number
    leader: string
    topTeam: string
  }
}

const HEADER_PRIMARY = 'rgba(232, 230, 240, 0.88)'
const HEADER_SECONDARY = 'rgba(199, 197, 208, 0.48)'
const HEADER_DISABLED = 'rgba(199, 197, 208, 0.46)'

/**
 * Header variants:
 *  - 'seasons' (default): full season UI — season selector, drivers/constructors
 *    toggle, and the title row (championship name + stats). Seasons page keeps
 *    passing season/onSeasonChange/mode/onModeChange exactly as before.
 *  - 'drivers': minimal header — brand + nav only, no season UI, no title row.
 *    The right-hand area is filled by `rightSlot` (e.g. the driver search box).
 *  - 'constructors': identical minimal layout to 'drivers', used by the
 *    constructor profile page (rightSlot holds the constructor search box).
 *  - 'circuits': same minimal layout again, used by the circuit profile page
 *    (rightSlot holds the circuit search box).
 */
type SeasonsProps = {
  variant?: 'seasons'
  // Optional now: the Seasons page has a picker landing state (no season
  // chosen yet) where the header renders with no season UI at all, same
  // idea as the other three pages' pre-selection empty states.
  season?: number
  onSeasonChange?: (s: number) => void
  mode?: 'drivers' | 'constructors'
  onModeChange?: (m: 'drivers' | 'constructors') => void
  rightSlot?: ReactNode
}

type MinimalProps = {
  variant: 'drivers' | 'constructors' | 'circuits' | 'credits'
  rightSlot?: ReactNode
  // Season props are irrelevant here; accepted as optional for a uniform call site.
  season?: number
  onSeasonChange?: (s: number) => void
  mode?: 'drivers' | 'constructors'
  onModeChange?: (m: 'drivers' | 'constructors') => void
}

type Props = SeasonsProps | MinimalProps

export function AlmanacHeader(props: Props) {
  const { variant = 'seasons', rightSlot } = props
  const isSeasons = variant === 'seasons'

  const pathname = usePathname()
  const [seasonOpen, setSeasonOpen] = useState(false)
  const [years, setYears] = useState<number[]>([])
  const [meta, setMeta] = useState<SeasonMeta | null>(null)

  const seasonBtnRef = useRef<HTMLButtonElement | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; width: number } | null>(null)

  // Season-specific props (only meaningful in the 'seasons' variant).
  const season = isSeasons ? props.season : undefined
  const onSeasonChange = isSeasons ? props.onSeasonChange : undefined
  const mode = isSeasons ? props.mode : undefined
  const onModeChange = isSeasons ? props.onModeChange : undefined

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  // Recompute dropdown position when opening (and on scroll/resize while open).
  useEffect(() => {
    if (!seasonOpen) return
    const update = () => {
      const el = seasonBtnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [seasonOpen])

  // Season list + meta are only fetched in the seasons variant.
  useEffect(() => {
    if (!isSeasons) return
    fetch('/api/seasons')
      .then((r) => (r.ok ? r.json() : { years: [] }))
      .then((j) => setYears(j.years ?? []))
      .catch(() => setYears([]))
  }, [isSeasons])

  useEffect(() => {
    if (!isSeasons || season === undefined) return
    const ctrl = new AbortController()
    fetch(`/api/season-meta?season=${season}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setMeta(j))
      .catch((e) => {
        if (e.name !== 'AbortError') setMeta(null)
      })
    return () => ctrl.abort()
  }, [isSeasons, season])

  const view = mode === 'drivers' ? 'driver' : 'constructor'

  return (
    <header className="relative z-[60] border-b border-white/[0.08]">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-5 py-4 sm:px-7">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden">
            <Image
              src="/Copilot_20260612_112825.png"
              alt="Formula 1 logo"
              width={70}
              height={70}
              className="h-14 w-14 translate-y-[1px] object-contain opacity-[0.76]"
            />
          </span>

          <span
            className="text-lg font-bold tracking-wide"
            style={{
              fontFamily: "'Exo 2', sans-serif",
              display: 'inline-block',
              color: HEADER_PRIMARY,
            }}
          >
            ALMANAC
          </span>
        </div>

        {/* Primary navigation */}
        <nav
          className="ml-4 hidden items-center gap-1 md:flex"
          style={{ fontFamily: "'Exo 2', sans-serif" }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            const base = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors'

            if (!item.enabled) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className={[base, 'cursor-not-allowed'].join(' ')}
                  style={{ color: HEADER_DISABLED }}
                >
                  {item.label}
                </span>
              )
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  base,
                  isActive
                    ? 'border border-white/15 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'hover:text-white/85',
                ].join(' ')}
                style={{
                  color: isActive ? HEADER_PRIMARY : HEADER_SECONDARY,
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-3">
          {/* Custom right-hand slot (e.g. driver search on /drivers). */}
          {rightSlot}

          {/* Season selector — seasons variant only, and only once a season
              is actually chosen (the picker landing state has neither). */}
          {isSeasons && season !== undefined && (
            <div className="relative">
              <button
                ref={seasonBtnRef}
                type="button"
                onClick={() => setSeasonOpen((o) => !o)}
                className="flex items-center gap-3 rounded-lg border border-white/12 bg-white/[0.05] px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/[0.08]"
                style={{
                  fontFamily: "'Exo 2', sans-serif",
                  color: HEADER_PRIMARY,
                }}
              >
                Season {season}

                <ChevronDown
                  className={[
                    'h-4 w-4 transition-transform',
                    seasonOpen ? 'rotate-180' : '',
                  ].join(' ')}
                  style={{ color: HEADER_SECONDARY }}
                />
              </button>

              {seasonOpen &&
                portalRoot &&
                menuPos &&
                createPortal(
                  <>
                    {/* click-away backdrop */}
                    <div
                      className="fixed inset-0 z-[9998]"
                      onClick={() => setSeasonOpen(false)}
                    />
                    <style jsx global>{`
                      .season-scroll {
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
                      }
                      .season-scroll::-webkit-scrollbar {
                        width: 5px;
                      }
                      .season-scroll::-webkit-scrollbar-track {
                        background: transparent;
                      }
                      .season-scroll::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.16);
                        border-radius: 999px;
                      }
                      .season-scroll::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.28);
                      }
                    `}</style>
                    <ul
                      role="listbox"
                      className="season-scroll fixed z-[9999] max-h-[280px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-[#15131f] p-1 shadow-xl"
                      style={{ top: menuPos.top, right: menuPos.right, width: menuPos.width }}
                    >
                      {years.map((y) => (
                        <li key={y}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={y === season}
                            onClick={() => {
                              onSeasonChange?.(y)
                              setSeasonOpen(false)
                            }}
                            className={[
                              'w-full rounded-md px-3.5 py-2 text-center text-sm whitespace-nowrap transition-colors',
                              y === season ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
                            ].join(' ')}
                            style={{
                              fontFamily: "'Exo 2', sans-serif",
                              color: y === season ? HEADER_PRIMARY : HEADER_SECONDARY,
                            }}
                          >
                            Season {y}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>,
                  portalRoot
                )}
            </div>
          )}

          {/* Driver / Constructor toggle — seasons variant only, same gate */}
          {isSeasons && season !== undefined && (
            <div className="flex items-center overflow-hidden rounded-lg border border-white/12 bg-white/[0.05]">
              <button
                type="button"
                onClick={() => onModeChange?.('drivers')}
                aria-label="Drivers view"
                aria-pressed={view === 'driver'}
                className={[
                  'flex h-9 w-16 items-center justify-center transition-all',
                  view === 'driver' ? 'bg-white/[0.12]' : 'hover:bg-white/[0.05]',
                ].join(' ')}
              >
                <img
                  src="/helmet.png"
                  alt=""
                  className="h-4 w-5 object-contain"
                  style={{
                    filter: 'invert(1)',
                    transform: 'scaleX(-1)',
                    opacity: view === 'driver' ? 0.92 : 0.4,
                    transition: 'opacity 0.2s',
                  }}
                />
              </button>

              <div className="w-px self-stretch bg-white/12" />

              <button
                type="button"
                onClick={() => onModeChange?.('constructors')}
                aria-label="Constructors view"
                aria-pressed={view === 'constructor'}
                className={[
                  'flex h-9 w-16 items-center justify-center transition-all',
                  view === 'constructor' ? 'bg-white/[0.12]' : 'hover:bg-white/[0.05]',
                ].join(' ')}
              >
                <img
                  src="/car-of-formula-1.png"
                  alt=""
                  className="h-10 w-10 object-contain"
                  style={{
                    filter: 'invert(1)',
                    transform: 'scaleX(-1)',
                    opacity: view === 'constructor' ? 0.92 : 0.4,
                    transition: 'opacity 0.2s',
                  }}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title row — seasons variant only, same gate */}
      {isSeasons && season !== undefined && (
        <div
          className="flex flex-col gap-4 border-t border-white/[0.06] px-5 py-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10"
          style={{ fontFamily: "'Exo 2', sans-serif" }}
        >
          <div className="flex min-w-0 flex-col gap-0.5 lg:pr-2">
            <div className="flex items-center gap-3">
              <h1
                className="truncate text-base font-bold tracking-tight sm:text-lg"
                style={{ color: HEADER_PRIMARY }}
              >
                {meta?.title ?? `${season} FIA Formula One World Championship`}
              </h1>

              {meta?.live && (
                <span
                  className="shrink-0 rounded-md border border-[#a98bf0]/30 bg-[#a98bf0]/10 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-[#c4adf5]"
                  style={{
                    boxShadow:
                      "0 0 3px rgba(169, 139, 240, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  LIVE
                </span>
              )}
            </div>

            <p
              className="text-sm font-normal italic leading-relaxed"
              style={{ color: HEADER_SECONDARY, minHeight: "calc(1.625em * 2)" }}
            >
              {/* minHeight reserves TWO lines always, not just "not zero".
                  season_descriptions is documented as 1-2 sentences, so two
                  lines is the real ceiling here — the non-breaking-space
                  placeholder alone only stopped the zero-to-one-line jump;
                  a genuine 2-line description arriving after a 1-line-tall
                  placeholder still grew the row by exactly one line, which
                  is the jump the screenshot caught. Fixing the height to the
                  worst case means loading, a 1-line description, and a
                  2-line description all render inside the same box. */}
              {meta?.description ?? "\u00A0"}
            </p>
          </div>

          {/* Stats */}
          <div className="flex shrink-0 items-start gap-7">
            {[
              { value: meta ? String(meta.stats.rounds) : '—', label: 'Rounds' },
              { value: meta ? String(meta.stats.drivers) : '—', label: 'Drivers' },
              { value: meta ? String(meta.stats.teams) : '—', label: 'Teams' },
              { value: meta?.stats.leader ?? '—', label: 'Leader' },
              { value: meta?.stats.topTeam ?? '—', label: 'Top Team' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex max-w-[120px] flex-col gap-1 text-center"
              >
                <div
                  className="text-base font-bold leading-tight tracking-tight"
                  style={{ color: HEADER_PRIMARY }}
                >
                  {stat.value}
                </div>

                <div
                  className="text-sm font-normal"
                  style={{ color: HEADER_SECONDARY }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
