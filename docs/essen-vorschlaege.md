# Essen planen mit dem Assistenten

Im Tab **Essen → Plan** hat jede Kalenderwoche den Button **„Essen planen“**. Er öffnet ein Modal
mit Vorschlägen für die noch freien Mittag-/Abend-Plätze der Woche (vergangene Tage nicht).

- Oben wählbar: nur Mittag, nur Abend oder beides (wird im Browser gemerkt). Nach einer Änderung
  „Neu erstellen“ drücken.
- Pro Platz: **Annehmen** (✓), **Ersetzen** (↻, nächste Alternative) oder **Ablehnen** (✗, Platz
  bleibt frei). „Rückgängig“ setzt eine Entscheidung zurück.
- Gespeichert wird erst mit **„N übernehmen“**. Plätze, die inzwischen anderweitig belegt wurden,
  werden nicht überschrieben.

## Wochentag-Kategorien

In **Einstellungen → Essen** kann jedem Wochentag eine Kategorie zugewiesen werden (z. B.
Freitag = Fisch). Für Plätze an solchen Tagen sind die Vorschläge auf diese Kategorie festgelegt:

- Claude bekommt die Kategorie pro Platz als Pflichtvorgabe.
- `resolveSuggestions` setzt sie zusätzlich im Code durch: Gerichte aus der Kategorie stehen vorn,
  fehlende werden lokal aus der Kategorie ergänzt. Andere Kategorien erscheinen nur, wenn die
  Kategorie nicht genug Gerichte hat.
- Gibt es in der Rezeptliste kein Gericht der eingestellten Kategorie, ist der Tag frei.
- Das Modal zeigt die Kategorie unter dem Tag an.

## Ablauf

`POST /api/meals/suggest` mit `{ "slots": [{ "date": "2026-12-01", "type": "lunch" }] }`.

1. Server prüft die Sitzung, lädt Familie (Wochentag-Kategorien), Essensplan der letzten 365 Tage
   und die Gerichte aus der Rezept-DB.
2. Claude (`claude-haiku-5-5`, Aufwand `low`) bekommt die Gerichte mit Statistik (wie oft, wann zuletzt, Bemerkung), das bereits
   Geplante rund um die Woche und die freien Plätze. Es antwortet per Structured Output mit bis zu
   drei **Rezept-IDs** pro Platz und einer kurzen Begründung – es kann also keine Gerichte erfinden.
3. `resolveSuggestions` (`src/lib/meals/mealSuggestions.ts`) prüft die IDs, entfernt Doppelungen,
   sorgt dafür, dass keine Empfehlung in zwei Plätzen steht, und füllt fehlende Alternativen lokal
   auf (`pickSuggestion`, gewichtet nach „lange nicht gegessen“, Wochentag-Kategorie bevorzugt).
4. Ist Claude nicht erreichbar (z. B. kein `ANTHROPIC_API_KEY`), kommen die Vorschläge komplett
   lokal; das Modal zeigt dann einen Hinweis.

Sind beim Ersetzen alle Alternativen durch, wählt der Client lokal ein weiteres Gericht.

Code: `src/app/api/meals/suggest/route.ts`, `src/lib/meals/mealSuggestions.ts`,
`src/lib/meals/suggestMealsAI.ts`, `src/components/meals/MealSuggestDialog.tsx`.
