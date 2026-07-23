'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'

type ConstructorListItem = {
  id: number
  name: string
  nationality: string | null
  years: string
}

const HEADER_PRIMARY = 'rgba(232, 230, 240, 0.88)'
const HEADER_SECONDARY = 'rgba(199, 197, 208, 0.48)'

// Normalize for accent-insensitive matching.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

type Props = {
  /** Currently selected constructor id (controls the closed-state label). */
  selectedId: number | null
  onSelect: (id: number) => void
}

export function ConstructorSearch({ selectedId, onSelect }: Props) {
  const [constructors, setConstructors] = useState<ConstructorListItem[]>([])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0) // highlighted option index

  const btnRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    setPortalRoot(document.body)
  }, [])

  // Load the full roster once; filtering happens client-side.
  useEffect(() => {
    fetch('/api/constructors')
      .then((r) => (r.ok ? r.json() : { constructors: [] }))
      .then((j) => setConstructors(j.constructors ?? []))
      .catch(() => setConstructors([]))
  }, [])

  // Recompute dropdown position when open (and on scroll/resize).
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Focus the input when the box opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const selected = useMemo(
    () => constructors.find((c) => c.id === selectedId) ?? null,
    [constructors, selectedId]
  )

  const results = useMemo(() => {
    const nq = norm(q.trim())
    if (nq === '') return constructors
    return constructors.filter((c) => norm(c.name).includes(nq))
  }, [constructors, q])

  // Keep the active index within bounds as results change.
  useEffect(() => {
    setActive(0)
  }, [q])

  function choose(id: number) {
    onSelect(id)
    setOpen(false)
    setQ('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = results[active]
      if (item) choose(item.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const placeholder = selected ? selected.name : 'Search constructor…'

  return (
    <div ref={btnRef} className="relative w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg border border-white/12 bg-white/[0.05] px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/[0.08]"
        style={{ fontFamily: "'Exo 2', sans-serif", color: HEADER_PRIMARY }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: HEADER_SECONDARY }} />
        <span
          className="truncate text-left"
          style={{ color: selected ? HEADER_PRIMARY : HEADER_SECONDARY }}
        >
          {placeholder}
        </span>
      </button>

      {open &&
        portalRoot &&
        menuPos &&
        createPortal(
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />

            <style jsx global>{`
              .constructor-scroll {
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
              }
              .constructor-scroll::-webkit-scrollbar {
                width: 5px;
              }
              .constructor-scroll::-webkit-scrollbar-track {
                background: transparent;
              }
              .constructor-scroll::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.16);
                border-radius: 999px;
              }
              .constructor-scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.28);
              }
            `}</style>

            <div
              className="fixed z-[9999] overflow-hidden rounded-lg border border-white/10 bg-[#15131f] shadow-xl"
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            >
              {/* Search input */}
              <div className="border-b border-white/[0.08] p-2">
                <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2.5 py-1.5">
                  <Search className="h-4 w-4 shrink-0" style={{ color: HEADER_SECONDARY }} />
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search constructor…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
                    style={{ fontFamily: "'Exo 2', sans-serif", color: HEADER_PRIMARY }}
                  />
                </div>
              </div>

              {/* Results */}
              <ul role="listbox" className="constructor-scroll max-h-[320px] overflow-y-auto p-1">
                {results.length === 0 && (
                  <li
                    className="px-3 py-3 text-center text-sm"
                    style={{ color: HEADER_SECONDARY, fontFamily: "'Exo 2', sans-serif" }}
                  >
                    No constructors found
                  </li>
                )}

                {results.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={c.id === selectedId}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(c.id)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        i === active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
                      ].join(' ')}
                      style={{
                        fontFamily: "'Exo 2', sans-serif",
                        color: c.id === selectedId ? HEADER_PRIMARY : 'rgba(199, 197, 208, 0.78)',
                      }}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.years && (
                        <span
                          className="shrink-0 text-xs tabular-nums tracking-wider"
                          style={{ color: HEADER_SECONDARY }}
                        >
                          {c.years}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          portalRoot
        )}
    </div>
  )
}
