export interface SessionDisplayInput {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function describeSession(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown browser";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /(?:Chrome|CriOS)\//.test(userAgent)
      ? "Chrome"
      : /(?:Firefox|FxiOS)\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent) && /Version\//.test(userAgent)
          ? "Safari"
          : "Browser";

  const device = /iPad/.test(userAgent)
    ? "iPad"
    : /iPhone|iPod/.test(userAgent)
      ? "iPhone"
      : /Android/.test(userAgent)
        ? "Android"
        : /CrOS/.test(userAgent)
          ? "ChromeOS"
          : /Windows/.test(userAgent)
            ? "Windows"
            : /Macintosh|Mac OS X/.test(userAgent)
              ? "macOS"
              : /Linux/.test(userAgent)
                ? "Linux"
                : null;

  return device ? `${browser} on ${device}` : browser;
}

export function maskIpAddress(ipAddress: string | null | undefined) {
  if (!ipAddress) return null;

  const address = ipAddress.trim().replace(/^::ffff:/, "");
  const ipv4Parts = address.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))) {
    if (address === "127.0.0.1") return "Local network";
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.x.x`;
  }

  if (address === "::1") return "Local network";
  if (address.includes(":")) {
    const visibleParts = address.split(":").filter(Boolean).slice(0, 2);
    return visibleParts.length ? `${visibleParts.join(":")}:…` : "IPv6 address";
  }

  return "Network address hidden";
}

export function formatSessionDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
