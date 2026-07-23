"use client";

import { useEffect, useState } from "react";

// Derives a short monogram from a constructor name.
// Single-word names take their first three letters (Minardi -> MIN);
// multi-word names take each word's initial (Team Lotus -> TL). Filler words
// that carry no identity are dropped so "Alpine F1 Team" reads as ALP, not AFT.
// Words that are corporate suffixes rather than identity: "Alpine F1 Team"
// should read ALP, not AFT. Note "Racing" is deliberately NOT here — it is
// part of the actual name in Racing Point / Racing Bulls, where RP / RB is
// the recognisable form.
const MONOGRAM_FILLER = new Set([
  "f1",
  "team",
  "grand",
  "prix",
  "engineering",
  "motorsport",
  "motors",
  "gp",
  "and",
  "the",
]);

export function monogramFor(name: string): string {
  const all = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ") // strip punctuation, keep letters/digits
    .split(/[\s-]+/)
    .filter(Boolean);

  if (all.length === 0) return "?";

  const meaningful = all.filter((w) => !MONOGRAM_FILLER.has(w.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : all;

  if (source.length === 1) {
    return source[0].slice(0, 3).toUpperCase();
  }
  return source
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Constructor badge: shows the team logo when one exists in
// public/constructor-logos/, otherwise a monogram in the team's colour.
// Most historic teams have no logo, so the monogram is the normal case, not an
// error state — drop a file named after the constructorRef into
// public/constructor-logos/ and it replaces the monogram automatically.
//
// `size` parameterizes the badge (originally fixed at 128px on the
// constructor profile page) so the same component works at the smaller
// scales a picker carousel needs, without duplicating the logo/monogram
// fallback logic in a second place.
export function ConstructorBadge({
  constructorRef,
  name,
  accent,
  size = 128,
}: {
  constructorRef: string | null;
  name: string;
  accent: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  // Reset when switching teams, otherwise one missing logo would suppress
  // the next team's logo too.
  useEffect(() => {
    setFailed(false);
  }, [constructorRef]);

  const hasRealRef = typeof constructorRef === "string" && constructorRef.trim().length > 0;
  const showLogo = hasRealRef && !failed;
  const monogram = name ? monogramFor(name) : "";
  const logoSize = Math.round(size * 0.61); // matches the original 78/128 ratio

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-black/25"
      style={{ width: size, height: size, borderColor: `${accent}55` }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/constructor-logo?ref=${encodeURIComponent(constructorRef)}`}
          alt=""
          style={{ width: logoSize, height: logoSize }}
          className="object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        // No logo file: fall back to the team's monogram. Before the name has
        // loaded, monogram is "" and the circle simply stays empty — a quiet
        // placeholder, rather than a generic icon unrelated to the team.
        <span
          className="select-none font-bold leading-none tracking-[0.06em]"
          style={{
            color: accent,
            // Shrink slightly for three-letter monograms so they stay inside
            // the circle at the same optical weight as two-letter ones, and
            // scale with the badge itself rather than the original's fixed
            // 34/42 (which only made sense at the one hardcoded 128px size).
            fontSize: (monogram.length >= 3 ? 0.266 : 0.328) * size,
          }}
        >
          {monogram}
        </span>
      )}
    </div>
  );
}
