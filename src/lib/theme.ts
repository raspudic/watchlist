export type ThemePreference = "light" | "system" | "dark";

export const THEME_STORAGE_KEY = "watchlist-theme";
/* Read once so a browser that stored a preference under the old product name
   keeps it through the rename. */
export const LEGACY_THEME_STORAGE_KEY = "later-theme";
export const THEME_CHANGE_EVENT = "watchlist-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "system" || value === "dark";
}

/* Runs before paint in the document head, so it stays a single expression
   with no imports. Keep it in sync with the constants above. */
export const THEME_BOOTSTRAP_SCRIPT = `try{var k="${THEME_STORAGE_KEY}",t=localStorage.getItem(k)||localStorage.getItem("${LEGACY_THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"&&t!=="system")t="system";localStorage.setItem(k,t);document.documentElement.dataset.theme=t}catch{}`;

export function readThemePreference(): ThemePreference {
  const current = document.documentElement.dataset.theme;
  return isThemePreference(current) ? current : "system";
}

export function writeThemePreference(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Storage can be unavailable in private modes; the DOM change still applies. */
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeToThemePreference(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}
