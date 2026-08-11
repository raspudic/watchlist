export const SHEET_DISMISS_DISTANCE_PX = 112;
export const SHEET_DISMISS_VELOCITY_PX_PER_MS = 0.55;

export function shouldDismissSheet(distance: number, velocity: number) {
  return distance >= SHEET_DISMISS_DISTANCE_PX || velocity >= SHEET_DISMISS_VELOCITY_PX_PER_MS;
}
