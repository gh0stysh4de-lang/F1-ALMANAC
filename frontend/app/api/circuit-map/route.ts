import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Circuit map lookup. Same shape as /api/constructor-logo: drop a file into
// public/circuit-maps/ named after the circuitRef and it is picked up with no
// code change.
//
// Unlike the logo route this returns the SVG *source*, not a redirect: the
// client inlines it so the track inherits `currentColor` from the page and can
// be tinted, hovered, and highlighted per-turn. A plain <img> can do none of
// that.
//
// Coverage is partial by design. The upstream geometry (bacinger/f1-circuits,
// MIT) covers ~40 of the 78 circuits in the dataset — mostly the modern ones.
// Historic tracks (Reims, Nordschleife, old Kyalami) have no machine-readable
// outline anywhere, and drawing one by eye would be inventing data. Those
// return 404 and the client falls back to a text-only identity block.

const MAPS_DIR = path.join(process.cwd(), "public", "circuit-maps");

// Only accept refs that look like a circuitRef: letters, digits, underscore.
// This is a path-traversal guard, not a validation of existence.
const SAFE_REF = /^[a-z0-9_]+$/i;

async function findMapFile(ref: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(MAPS_DIR);
  } catch {
    return null; // folder not created yet
  }

  const target = ref.toLowerCase();
  for (const entry of entries) {
    const base = entry.replace(/\.[^.]+$/, "").toLowerCase();
    if (base === target) return path.join(MAPS_DIR, entry);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");

  if (!ref || !SAFE_REF.test(ref)) {
    return NextResponse.json(
      { error: "Query param `ref` must be a circuitRef" },
      { status: 400 }
    );
  }

  const file = await findMapFile(ref);
  if (!file) {
    return NextResponse.json({ error: "No map for this circuit" }, { status: 404 });
  }

  try {
    const svg = await readFile(file, "utf8");
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        // Dev: no cache, so replacing a file shows up on reload.
        // Prod: these never change once shipped.
        "Cache-Control":
          process.env.NODE_ENV === "production"
            ? "public, max-age=86400, immutable"
            : "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/circuit-map]", err);
    return NextResponse.json({ error: "Failed to read map" }, { status: 500 });
  }
}
