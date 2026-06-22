'use client'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Star = {
  top: string
  left: string
  size: number
  opacity: number
  purple: boolean
  twinkleSpeed: number
  twinkleDelay: number
}

const STAR_COUNT = 300
const CLUSTER_COUNT = 60

function generateStars(): Star[] {
  const rand = mulberry32(20240611)
  const stars: Star[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      top: `${(rand() * 100).toFixed(3)}%`,
      left: `${(rand() * 100).toFixed(3)}%`,
      size: rand() < 0.80 ? 1 : rand() < 0.95 ? 1.5 : 2,
      opacity: 0.10 + rand() * 0.35,
      purple: rand() < 0.35,
      twinkleSpeed: 4 + rand() * 7,
      twinkleDelay: rand() * 4,
    })
  }
  return stars
}

function generateCluster(): Star[] {
  const rand = mulberry32(99887766)
  const stars: Star[] = []
  const centerX = 75
  const centerY = 25
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const angle = rand() * Math.PI * 2
    const distance = rand() * rand() * 8
    stars.push({
      top: `${(centerY + Math.sin(angle) * distance).toFixed(3)}%`,
      left: `${(centerX + Math.cos(angle) * distance).toFixed(3)}%`,
      size: rand() < 0.7 ? 1 : rand() < 0.95 ? 1.5 : 2,
      opacity: 0.04 + rand() * 0.15,
      purple: rand() < 0.5,
      twinkleSpeed: 3 + rand() * 8,
      twinkleDelay: rand() * 6,
    })
  }
  return stars
}

export function Starfield({ mouseActive = false }: { mouseActive?: boolean }) {
  const stars = generateStars()
  const cluster = generateCluster()

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: var(--base-opacity); }
          25% { opacity: var(--bright-opacity); }
          50% { opacity: var(--dim-opacity); }
          75% { opacity: var(--bright-opacity); }
        }
      `}</style>

      {stars.map((star, i) => {
        const brightOpacity = Math.min(star.opacity * 3, 1.0)
        const dimOpacity = star.opacity * 0.3
        return (
          <span
            key={`s${i}`}
            className="absolute rounded-full"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              backgroundColor: star.purple
                ? 'rgb(190, 160, 255)'
                : 'rgb(255, 255, 255)',
              ['--base-opacity' as string]: star.opacity,
              ['--bright-opacity' as string]: mouseActive ? brightOpacity : star.opacity * 2,
              ['--dim-opacity' as string]: dimOpacity,
              animation: `twinkle ${star.twinkleSpeed}s ease-in-out ${star.twinkleDelay}s infinite`,
              boxShadow: star.size > 1
                ? `0 0 ${mouseActive ? 4 : 2}px ${star.purple ? 'rgba(190,160,255,0.5)' : 'rgba(255,255,255,0.4)'}`
                : 'none',
              transition: 'box-shadow 0.5s ease',
            }}
          />
        )
      })}

      {cluster.map((star, i) => (
        <span
          key={`c${i}`}
          className="absolute rounded-full"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            backgroundColor: star.purple
              ? 'rgba(180, 150, 240, 0.8)'
              : 'rgba(220, 220, 255, 0.8)',
            ['--base-opacity' as string]: star.opacity,
            ['--bright-opacity' as string]: star.opacity * 1.8,
            ['--dim-opacity' as string]: star.opacity * 0.4,
            animation: `twinkle ${star.twinkleSpeed}s ease-in-out ${star.twinkleDelay}s infinite`,
          }}
        />
      ))}

      {/* Cluster glow */}
      <div
        className="absolute rounded-full blur-xl"
        style={{
          top: '22%',
          left: '72%',
          width: '12%',
          height: '8%',
          background: 'radial-gradient(circle, rgba(150,120,220,0.04), transparent 70%)',
        }}
      />
    </div>
  )
}