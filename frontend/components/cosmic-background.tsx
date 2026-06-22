'use client'

import { useEffect, useState } from 'react'
import { Starfield } from './starfield'

export function CosmicBackground() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [mouseActive, setMouseActive] = useState(false)

  useEffect(() => {
    let timeout: NodeJS.Timeout

    function handleMove(e: MouseEvent) {
      const x = e.clientX / window.innerWidth - 0.5
      const y = e.clientY / window.innerHeight - 0.5
      setOffset({ x, y })
      setMouseActive(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setMouseActive(false), 2000)
    }

    window.addEventListener('mousemove', handleMove)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 will-change-transform"
        style={{
          transform: `scale(1.1) translate3d(${offset.x * -28}px, ${offset.y * -28}px, 0)`,
          transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
          backgroundImage: [
            'radial-gradient(ellipse 90% 45% at 50% 10%, rgba(120,80,200,0.18), transparent 70%)',
            'radial-gradient(ellipse 70% 30% at 45% 8%, rgba(170,120,255,0.12), transparent 65%)',
            'radial-gradient(ellipse 30% 35% at 20% 60%, rgba(100,50,180,0.02), transparent 60%)',
            'radial-gradient(ellipse 25% 20% at 85% 40%, rgba(140,80,220,0.06), transparent 55%)',
            'radial-gradient(circle at 8% 92%, rgba(232,0,61,0.04), transparent 40%)',
            'radial-gradient(circle at 90% 85%, rgba(180,100,255,0.04), transparent 35%)',
          ].join(', '),
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 will-change-transform"
        style={{
          transform: `scale(1.05) translate3d(${offset.x * 16}px, ${offset.y * 16}px, 0)`,
          transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <Starfield mouseActive={mouseActive} />
      </div>
    </>
  )
}