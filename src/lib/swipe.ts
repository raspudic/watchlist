export type SwipeRelease = "close" | "reveal" | "remove";

export function getSwipeRelease(offset: number, width: number): SwipeRelease {
  if (width > 0 && offset <= -(width * 0.65)) return "remove";
  if (offset < -44) return "reveal";
  return "close";
}
