"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

// Inlines a track outline from /api/circuit-map, tints it, and labels its turns
// on hover.
//
// Why inline rather than <img src>: the SVG files use `currentColor` and carry
// invisible per-turn hit areas (<g id="turns">, data-turn="N"). Inside an <img>
// neither works — no inheritance, no hover targets.
//
// The centre-bright shading is applied here, not baked into the files: the spec
// keeps them filter-free because 40 SVG <filter>s in a grid rasterise on the CPU.

type TurnName = {
  turnFrom: number;
  turnTo: number;
  name: string;
  nameAlt: string | null;
  kind: string;
  confidence: string;
  note: string | null;
  sourceUrl: string;
};

type Props = {
  /** circuitRef, e.g. "spa". */
  circuitRef: string;
  /** Base stroke colour. */
  accent?: string;
  /** Rendered size in px (the SVG viewBox is always square). */
  size?: number;
  /** Centre-bright, edge-dark shading. Off in dense grids, on for the profile. */
  shade?: boolean;
  /** Turn hover labels. Costs a fetch, so off by default in grids. */
  interactive?: boolean;
  /** Called when the map is known to be missing, so parents can lay out around it. */
  onMissing?: () => void;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; svg: string }
  | { kind: "missing" };

type Hover = {
  svgTurn: number;
  officialTurn: number | null;
  x: number;
  y: number;
};

const NAMED_CIRCUITS = new Set([
  "catalunya",
  "imola",
  "interlagos",
  "monaco",
  "monza",
  "mugello",
  "nurburgring",
  "red_bull_ring",
  "silverstone",
  "spa",
  "suzuka",
  "zandvoort",
]);

// The SVG points come from curvature detection, while the names use published
// corner numbering. Most points line up naturally; these tracks need a small
// reconciliation table because a broad corner can produce two points, a subtle
// corner can produce none, and an unnumbered kink can look like a corner.
// Index 0 is unused. A null entry marks an unnumbered track section.
const TURN_NUMBER_MAP: Record<string, readonly (number | null)[]> = {
  monza: [null, 1, 2, 3, null, 4, 5, 6, 7, null, 8, 9, 10, 11],
  mugello: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null, 12, 13, 14, 15],
  nurburgring: [
    null,
    1,
    2,
    3,
    4,
    5,
    6,
    null,
    null,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
  ],
  silverstone: [
    null,
    1,
    2,
    3,
    3,
    4,
    5,
    5,
    6,
    7,
    7,
    7,
    8,
    9,
    10,
    11,
    13,
    14,
    15,
    16,
    17,
  ],
  zandvoort: [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 14],
};

function officialTurnFor(circuitRef: string, svgTurn: number) {
  const mapping = TURN_NUMBER_MAP[circuitRef];
  return mapping ? (mapping[svgTurn] ?? null) : svgTurn;
}

// Visible dot size and hover snap distance, in SCREEN pixels — converted to
// viewBox units at render time so both feel the same at any size.
const DOT_PX = 7;
const SNAP_PX = 26;

const TEXT_PRIMARY = "rgba(232, 230, 240, 0.90)";
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.65)";
const TEXT_MUTED = "rgba(199, 197, 208, 0.50)";

export function CircuitMap({
  circuitRef,
  accent = "rgba(160, 120, 240, 0.9)",
  size = 320,
  shade = true,
  interactive = false,
  onMissing,
}: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [names, setNames] = useState<TurnName[]>([]);
  const [hover, setHover] = useState<Hover | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const activeTurnRef = useRef<number | null>(null);

  const rawId = useId();
  const gradId = useMemo(
    () => `track-grad-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );

  const onMissingRef = useRef(onMissing);
  useEffect(() => {
    onMissingRef.current = onMissing;
  }, [onMissing]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setHover(null);
    activeTurnRef.current = null;

    fetch(`/api/circuit-map?ref=${encodeURIComponent(circuitRef)}`)
      .then((res) => {
        if (!res.ok) throw new Error("no map");
        return res.text();
      })
      .then((svg) => {
        if (cancelled) return;
        setState({ kind: "ready", svg });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "missing" });
        onMissingRef.current?.();
      });

    return () => {
      cancelled = true;
    };
  }, [circuitRef]);

  // Turn names are optional decoration: only 12 of 78 circuits have any, and a
  // circuit with none still labels its turns by number.
  //
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    setNames([]);

    if (!NAMED_CIRCUITS.has(circuitRef)) return;

    fetch(`/api/circuit-turns?ref=${encodeURIComponent(circuitRef)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setNames(d.turns ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setNames([]);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitRef, interactive]);

  // Build the gradient into the SVG markup before React inserts it. Mutating
  // the rendered SVG in an effect is temporary: a later state update (for
  // example, loaded turn names or hover state) can replace innerHTML and erase
  // those DOM changes.
  const renderedSvg = useMemo(() => {
    if (state.kind !== "ready" || !shade) {
      return state.kind === "ready" ? state.svg : "";
    }

    const defs = [
      "<defs>",
      `<radialGradient id="${gradId}" cx="50%" cy="50%" r="70.71%">`,
      `<stop offset="0" stop-color="${accent}" stop-opacity="1"/>`,
      `<stop offset="0.55" stop-color="${accent}" stop-opacity="0.94"/>`,
      `<stop offset="1" stop-color="${accent}" stop-opacity="0.6"/>`,
      "</radialGradient>",
      "</defs>",
    ].join("");

    return state.svg
      .replace(/(<svg\b[^>]*>)/, `$1${defs}`)
      .replace(
        /(<path\b(?![^>]*\bid=)[^>]*\bstroke=)["']currentColor["']/,
        `$1"url(#${gradId})"`
      );
  }, [state, shade, accent, gradId]);

  // Use React's pointer event directly on the host. Unlike an effect-installed
  // listener, this handler cannot run before the injected SVG has been laid out.
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive) return;

      const svg = event.currentTarget.querySelector("svg");
      const matrix = svg?.getScreenCTM();
      if (!svg || !matrix) return;

      const circles = Array.from(
        svg.querySelectorAll<SVGCircleElement>("[data-turn]")
      );
      if (circles.length === 0) return;

      const scaleX = Math.hypot(matrix.a, matrix.b);
      const scaleY = Math.hypot(matrix.c, matrix.d);
      const scale = (scaleX + scaleY) / 2;
      const radius = Number.isFinite(scale) && scale > 0 ? DOT_PX / 2 / scale : 9;

      let best: SVGCircleElement | null = null;
      let bestTurn = 0;
      let bestDistance = Infinity;
      let bestX = 0;
      let bestY = 0;

      for (const circle of circles) {
        circle.setAttribute("r", String(radius));

        const turn = Number(circle.dataset.turn);
        const cx = Number(circle.getAttribute("cx"));
        const cy = Number(circle.getAttribute("cy"));
        const screenX = matrix.a * cx + matrix.c * cy + matrix.e;
        const screenY = matrix.b * cx + matrix.d * cy + matrix.f;
        const distance = Math.hypot(
          screenX - event.clientX,
          screenY - event.clientY
        );

        if (distance < bestDistance) {
          best = circle;
          bestTurn = turn;
          bestDistance = distance;
          bestX = screenX;
          bestY = screenY;
        }
      }

      const nextTurn = best && bestDistance <= SNAP_PX ? bestTurn : null;
      for (const circle of circles) {
        circle.setAttribute(
          "opacity",
          Number(circle.dataset.turn) === nextTurn ? "0.9" : "0"
        );
      }

      if (nextTurn === activeTurnRef.current) return;
      activeTurnRef.current = nextTurn;
      setHover(
        nextTurn === null
          ? null
          : {
              svgTurn: nextTurn,
              officialTurn: officialTurnFor(circuitRef, nextTurn),
              x: bestX,
              y: bestY,
            }
      );
    },
    [circuitRef, interactive]
  );

  const handlePointerLeave = useCallback(() => {
    activeTurnRef.current = null;
    setHover(null);

    const circles = hostRef.current?.querySelectorAll<SVGCircleElement>(
      "[data-turn]"
    );
    circles?.forEach((circle) => circle.setAttribute("opacity", "0"));
  }, []);

  // Resolve a turn number to its name. Names cover ranges, not single turns:
  // F1.com groups Spa's 2/3/4 as one corner, and a third of the turns on a
  // documented circuit are simply unnamed.
  //
  // Where two ranges overlap (Spa's Kemmel straight sits inside Les Combes;
  // Suzuka's Dunlop Curve inside the S Curves) prefer the better-attested one,
  // then the tighter one — the specific name beats the umbrella.
  const nameFor = useCallback(
    (turn: number): TurnName | null => {
      const hits = names.filter((n) => turn >= n.turnFrom && turn <= n.turnTo);
      if (hits.length === 0) return null;
      const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
      hits.sort((a, b) => {
        const byConf = (rank[a.confidence] ?? 3) - (rank[b.confidence] ?? 3);
        if (byConf !== 0) return byConf;
        return a.turnTo - a.turnFrom - (b.turnTo - b.turnFrom);
      });
      return hits[0];
    },
    [names]
  );

  if (state.kind === "missing") return null;

  if (state.kind === "loading") {
    return <div style={{ width: size, height: size }} aria-hidden="true" />;
  }

  const hovered =
    hover?.officialTurn == null ? null : nameFor(hover.officialTurn);

  return (
    <>
      <div
        ref={hostRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="[&>svg]:h-full [&>svg]:w-full"
        style={{
          width: size,
          height: size,
          color: accent,
          position: "relative",
          zIndex: 1,
          pointerEvents: interactive ? "auto" : undefined,
        }}
        dangerouslySetInnerHTML={{ __html: renderedSvg }}
      />

      {hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] rounded-lg border px-3 py-2"
            role="status"
            aria-live="polite"
            style={{
              left: hover.x + 14,
              top: hover.y,
              transform: "translateY(-50%)",
              zIndex: 2147483647,
              borderColor: "rgba(255,255,255,0.10)",
              background: "rgba(12, 13, 32, 1)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.50)",
              maxWidth: 260,
            }}
          >
            {hovered ? (
              <>
                <div
                  className="text-[13px] font-medium"
                  style={{ color: TEXT_PRIMARY }}
                >
                  {hovered.name}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: TEXT_MUTED }}>
                  {hovered.turnFrom === hovered.turnTo
                    ? `Turn ${hovered.turnFrom}`
                    : `Turns ${hovered.turnFrom}\u2013${hovered.turnTo}`}
                  {" \u00b7 "}
                  {hovered.kind}
                </div>
                {hovered.nameAlt && (
                  <div
                    className="mt-1 text-[11px] italic"
                    style={{ color: TEXT_SECONDARY }}
                  >
                    also: {hovered.nameAlt}
                  </div>
                )}
              </>
            ) : (
              <div className="text-[13px]" style={{ color: TEXT_SECONDARY }}>
                {hover.officialTurn == null
                  ? "Track section"
                  : `Turn ${hover.officialTurn}`}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
