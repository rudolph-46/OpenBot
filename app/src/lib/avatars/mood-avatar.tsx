import { funEmoji } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { useMemo } from "react";

/**
 * The one style this deployment draws every avatar from (DiceBear's `fun-emoji` faces), replacing
 * the abstract gradient blobs `boring-avatars` used to produce. Generated entirely in the browser
 * from a seed string — no network call to a third party, unlike DiceBear's own hosted HTTP API, so
 * nothing about who this deployment's Bots or people are ever leaves it just to draw a face.
 */

/** A deterministic face for one seed, as a data URI ready for an <img> src. */
export function moodAvatarDataUri(seed: string): string {
  return createAvatar(funEmoji, { seed, size: 128 }).toDataUri();
}

export function MoodAvatar({
  seed,
  name,
  size = 40,
  className,
}: {
  seed: string;
  /** Read aloud in place of the image; omit to leave the image itself unlabelled. */
  name?: string;
  size?: number;
  className?: string;
}) {
  const src = useMemo(() => moodAvatarDataUri(seed), [seed]);
  return (
    <img
      alt={name ?? ""}
      className={className}
      height={size}
      src={src}
      width={size}
    />
  );
}
