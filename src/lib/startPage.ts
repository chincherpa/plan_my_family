/**
 * Die App startet immer mit der Startseite „Heute“ — auch wenn der Browser
 * ein Lesezeichen oder einen wiederhergestellten Tab auf einer anderen Seite
 * öffnet. Nur beim Neuladen (F5) bleibt man, wo man ist.
 *
 * `navigationType` ist `PerformanceNavigationTiming.type` der Seitenladung:
 * "navigate" (Adresse, Lesezeichen, Link von außen, App-Start),
 * "back_forward" (u. a. Tab-Wiederherstellung), "reload", "prerender".
 */
export function shouldOpenDashboard(navigationType: string | undefined, pathname: string): boolean {
  if (pathname === "/") return false;
  return navigationType !== "reload";
}

/** Typ der aktuellen Seitenladung; undefined, wenn der Browser ihn nicht kennt. */
export function currentNavigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type;
  } catch {
    return undefined;
  }
}
