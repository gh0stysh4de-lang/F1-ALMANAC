import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Serves a constructor's logo from public/constructor-logos/.
//
// Why a route instead of a plain <img src="/constructor-logos/ferrari.png">:
// the files use mixed extensions (.png, .webp, .jpg), so a static path would
// need the caller to know each one. This scans the directory and matches on
// filename stem, meaning you can drop in `newteam.webp` and it just works —
// no code change, no extension list to maintain.
//
// Lookup order: exact constructorRef match first, then the alias table below
// for the few cases where our filename differs from the DB's constructorRef.

export const runtime = "nodejs";

const LOGO_DIR = path.join(process.cwd(), "public", "constructor-logos");

// Filenames that don't match the DB's constructorRef 1:1.
// Key = constructorRef in BigQuery, value = filename stem on disk.
const ALIASES: Record<string, string> = {
  moda: "andrea_moda", // DB: moda        → file: andrea_moda
  mf1: "midland", // DB: mf1         → file: midland (the team was Midland F1)
  spyker_mf1: "midland", // same lineage, same badge
  rb: "racing_bulls", // DB: rb          → file: racing_bulls
};

const ALLOWED_EXT = new Set([".png", ".webp", ".jpg", ".jpeg", ".svg", ".avif"]);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

// Cache the directory listing: the folder only changes when files are added,
// and re-reading it on every request would be wasteful. In dev the process
// restarts on change anyway; in prod a redeploy picks up new files.
let cachedFiles: string[] | null = null;

async function listLogoFiles(): Promise<string[]> {
  if (cachedFiles !== null) return cachedFiles;
  try {
    cachedFiles = await fs.readdir(LOGO_DIR);
  } catch {
    // Directory missing entirely — treat as "no logos available".
    cachedFiles = [];
  }
  return cachedFiles;
}

/** Reject anything that isn't a plain constructorRef-shaped token. */
function isSafeRef(ref: string): boolean {
  return /^[a-z0-9_]+$/i.test(ref);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawRef = (searchParams.get("ref") ?? "").trim().toLowerCase();

  // Guard against path traversal: only allow simple identifier characters,
  // never separators or dots that could escape the logo directory.
  if (!rawRef || !isSafeRef(rawRef)) {
    return NextResponse.json({ error: "Invalid 'ref'." }, { status: 400 });
  }

  const stem = ALIASES[rawRef] ?? rawRef;
  const files = await listLogoFiles();

  const match = files.find((file) => {
    const ext = path.extname(file).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return false;
    return path.basename(file, path.extname(file)).toLowerCase() === stem;
  });

  if (!match) {
    // Not an error: most historic teams simply have no logo. The client
    // falls back to the coloured icon.
    return NextResponse.json({ error: "No logo for this constructor." }, {
      status: 404,
    });
  }

  const filePath = path.join(LOGO_DIR, match);

  // Belt-and-braces: ensure the resolved path really is inside LOGO_DIR.
  if (!filePath.startsWith(LOGO_DIR)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(match).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        // Logos are static assets; cache hard.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("[/api/constructor-logo] read failed:", err);
    return NextResponse.json({ error: "Failed to read logo." }, { status: 500 });
  }
}
