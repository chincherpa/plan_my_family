// Einkaufszettel an die Bring!-App übergeben.
//
// Bring importiert Rezepte über einen Deeplink: Bring lädt die angegebene Seite und liest
// daraus das schema.org-Rezept (JSON-LD, `recipeIngredient`). Damit dafür keine Anmeldung
// und keine Datenbank nötig ist, steckt der Einkaufszettel komplett in der URL der Seite
// (`/api/bring/recipe?d=…`, base64url-kodiertes JSON). Die Seite muss öffentlich erreichbar
// sein – vom lokalen Rechner (localhost) aus kann Bring sie nicht abrufen.

import type { IngredientLine } from "./shoppingList";

export const BRING_DEEPLINK = "https://api.getbring.com/rest/bringrecipes/deeplink";
export const BRING_RECIPE_PATH = "/api/bring/recipe";

const MAX_ITEMS = 200;
const MAX_TEXT = 200;

export type BringList = {
  /** Titel, unter dem die Zutaten in Bring erscheinen */
  title: string;
  /** Zutaten als Freitext, z.B. "300 g Mehl" */
  items: string[];
};

/** Zeile für Bring: Menge vor der Zutat („300 g + 1 Dose Tomaten“), so erkennt Bring die Spezifikation. */
export function bringItem(line: Pick<IngredientLine, "zutat" | "amounts">): string {
  const amount = line.amounts.join(" + ").trim();
  return amount ? `${amount} ${line.zutat.trim()}` : line.zutat.trim();
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeBringList(list: BringList): string {
  return toBase64Url(JSON.stringify({ t: list.title, i: list.items }));
}

/** Liest einen Einkaufszettel aus dem URL-Parameter; null bei ungültigen Daten. */
export function decodeBringList(data: string | null): BringList | null {
  if (!data) return null;
  try {
    const raw = JSON.parse(fromBase64Url(data)) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const { t, i } = raw as { t?: unknown; i?: unknown };
    if (typeof t !== "string" || !Array.isArray(i)) return null;
    const items = i
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().slice(0, MAX_TEXT))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
    return { title: t.trim().slice(0, MAX_TEXT) || "Einkaufszettel", items };
  } catch {
    return null;
  }
}

/** Deeplink, der Bring öffnet und die Zutaten zum Hinzufügen anbietet. */
export function bringDeeplink(origin: string, list: BringList): string {
  const page = `${origin.replace(/\/$/, "")}${BRING_RECIPE_PATH}?d=${encodeBringList(list)}`;
  const params = new URLSearchParams({ url: page, source: "web" });
  return `${BRING_DEEPLINK}?${params}`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML-Seite mit schema.org-Rezept, die Bring beim Import ausliest. */
export function bringRecipeHtml(list: BringList): string {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: list.title,
    recipeYield: "1",
    recipeIngredient: list.items,
  })
    // Kein vorzeitiges </script> durch Zutaten-Text
    .replace(/</g, "\\u003c");
  const title = escapeHtml(list.title);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${title}</h1>
<ul>
${list.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("\n")}
</ul>
</body>
</html>`;
}
