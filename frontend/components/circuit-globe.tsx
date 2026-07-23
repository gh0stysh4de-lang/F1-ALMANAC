"use client";

// A small SVG globe marking where a circuit is.
//
// Deliberately dependency-free: an orthographic projection is just
// trigonometry, and pulling in d3-geo (plus TopoJSON land data) for one
// decorative element isn't worth the bundle weight or the cold-start cost.
//
// The globe rotates so the circuit sits at the centre facing the viewer,
// which doubles as the "where in the world is this" answer — no panning or
// zooming needed.

type Props = {
  lat: number;
  lng: number;
  /** Team/page accent colour for the marker. */
  accent?: string;
  /** Rendered size in px. */
  size?: number;
};

const GRID = "rgba(160, 190, 255, 0.16)";
const GRID_STRONG = "rgba(160, 190, 255, 0.28)";
const RIM = "rgba(160, 190, 255, 0.35)";

/**
 * Orthographic projection: rotate the sphere so (centreLat, centreLng) faces
 * the viewer, then flatten. Returns null for points on the far side.
 */
function project(
  lat: number,
  lng: number,
  centreLat: number,
  centreLng: number,
  radius: number
): { x: number; y: number } | null {
  const toRad = Math.PI / 180;
  const phi = lat * toRad;
  const lambda = (lng - centreLng) * toRad;
  const phi0 = centreLat * toRad;

  // cos(c) is the cosine of the angular distance from the projection centre.
  // Negative means the point is round the back of the globe.
  const cosC =
    Math.sin(phi0) * Math.sin(phi) +
    Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);

  if (cosC < 0) return null;

  const x = radius * Math.cos(phi) * Math.sin(lambda);
  const y =
    radius *
    (Math.cos(phi0) * Math.sin(phi) -
      Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda));

  // SVG y grows downward; geographic y grows north.
  return { x, y: -y };
}

/** Build an SVG path for a meridian or parallel, splitting at the horizon. */
function graticulePath(
  points: [number, number][],
  centreLat: number,
  centreLng: number,
  radius: number
): string {
  let d = "";
  let drawing = false;

  for (const [lat, lng] of points) {
    const p = project(lat, lng, centreLat, centreLng, radius);
    if (p === null) {
      // Point is behind the globe — lift the pen.
      drawing = false;
      continue;
    }
    d += `${drawing ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    drawing = true;
  }

  return d;
}

function meridian(lng: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let lat = -90; lat <= 90; lat += 3) pts.push([lat, lng]);
  return pts;
}

function parallel(lat: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += 3) pts.push([lat, lng]);
  return pts;
}

export function CircuitGlobe({
  lat,
  lng,
  accent = "rgba(160, 120, 240, 0.9)",
  size = 128,
}: Props) {
  const r = size / 2 - 2; // leave room for the rim stroke
  const c = size / 2;

  // Centre the globe on the circuit.
  const centreLat = lat;
  const centreLng = lng;

  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
  const parallels = [-60, -30, 0, 30, 60];

  const marker = project(lat, lng, centreLat, centreLng, r);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Circuit location on a globe"
    >
      <defs>
        {/* Subtle shading so the sphere reads as a sphere, not a disc. */}
        <radialGradient id="globe-shade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="rgba(80, 90, 150, 0.35)" />
          <stop offset="65%" stopColor="rgba(20, 22, 48, 0.55)" />
          <stop offset="100%" stopColor="rgba(8, 9, 24, 0.85)" />
        </radialGradient>
        {/* Clip everything to the sphere so graticules can't spill past it. */}
        <clipPath id="globe-clip">
          <circle cx={c} cy={c} r={r} />
        </clipPath>
      </defs>

      <circle cx={c} cy={c} r={r} fill="url(#globe-shade)" />

      <g clipPath="url(#globe-clip)" transform={`translate(${c},${c})`}>
        {parallels.map((p) => (
          <path
            key={`p${p}`}
            d={graticulePath(parallel(p), centreLat, centreLng, r)}
            fill="none"
            stroke={p === 0 ? GRID_STRONG : GRID}
            strokeWidth={p === 0 ? 0.8 : 0.5}
          />
        ))}
        {meridians.map((m) => (
          <path
            key={`m${m}`}
            d={graticulePath(meridian(m), centreLat, centreLng, r)}
            fill="none"
            stroke={m === 0 ? GRID_STRONG : GRID}
            strokeWidth={m === 0 ? 0.8 : 0.5}
          />
        ))}
      </g>

      {/* Rim */}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={RIM}
        strokeWidth={0.75}
      />

      {/* Circuit marker — always centre-facing, so it sits mid-globe. */}
      {marker && (
        <g transform={`translate(${c + marker.x},${c + marker.y})`}>
          <circle r={7} fill={accent} opacity={0.18}>
            <animate
              attributeName="r"
              values="5;10;5"
              dur="2.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.28;0;0.28"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r={2.6} fill={accent} />
        </g>
      )}
    </svg>
  );
}
