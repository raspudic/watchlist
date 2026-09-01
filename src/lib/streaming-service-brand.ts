export type StreamingServiceIdentity = {
  key: string;
  name: string;
};

function normalizedName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * TMDB/JustWatch can assign more than one provider id to the same consumer
 * service. Keep those upstream ids for matching availability, but give the UI
 * one stable brand identity. Explicit aliases are deliberately conservative:
 * equal names are always one service, while only known plan/name variants are
 * folded together.
 */
export function streamingServiceIdentity(name: string): StreamingServiceIdentity {
  const displayName = name.trim().replace(/\s+/g, " ");
  const normalized = normalizedName(displayName);

  if (/^(?:amazon )?prime video(?: (?:with|free with) ads)?$/.test(normalized)) {
    return { key: "prime-video", name: "Prime Video" };
  }

  return { key: `name:${normalized}`, name: displayName };
}
