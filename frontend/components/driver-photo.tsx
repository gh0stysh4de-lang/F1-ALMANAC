"use client";

import { UserRound } from "lucide-react";

// Driver photo badge: Wikipedia thumbnail when one loads, a generic person
// icon otherwise. Unlike ConstructorBadge, there's no "monogram" fallback
// here — initials-from-a-name doesn't carry the same identity a team's
// two-or-three-letter badge does, so a neutral icon is the honest default
// rather than reaching for something that would look like a real feature.
//
// `size` parameterizes this (originally fixed at 108px on the driver profile
// page) so the same component works at the smaller scales a picker carousel
// needs, without duplicating the photo/fallback logic in a second place.
const TEXT_SECONDARY = "rgba(199, 197, 208, 0.65)";

export function DriverPhoto({
  photoUrl,
  name,
  size = 108,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
}) {
  const iconSize = Math.round(size * 0.37); // matches the original 40/108 ratio

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-black/25"
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name || "Driver photo"}
          className="h-full w-full object-cover"
          style={{ objectPosition: "top" }}
        />
      ) : (
        <UserRound
          style={{ width: iconSize, height: iconSize, color: TEXT_SECONDARY }}
        />
      )}
    </div>
  );
}
