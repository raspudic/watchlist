export type SwipeRelease =
  | "close"
  | "reveal-remove"
  | "remove"
  | "reveal-watched"
  | "watched";

/* Width of the action tray a released swipe rests against. */
export const SWIPE_TRAY_WIDTH = 92;

const REVEAL_THRESHOLD = 44;
/* A swipe across most of the row commits its action outright. */
const COMMIT_RATIO = 0.65;

export function getSwipeRelease(offset: number, width: number): SwipeRelease {
  const commit = width > 0 ? width * COMMIT_RATIO : Infinity;

  if (offset <= -commit) return "remove";
  if (offset >= commit) return "watched";
  if (offset < -REVEAL_THRESHOLD) return "reveal-remove";
  if (offset > REVEAL_THRESHOLD) return "reveal-watched";
  return "close";
}
