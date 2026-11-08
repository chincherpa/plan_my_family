import type { jsPDF as JsPDF } from "jspdf";
import type { RecipeWithIngredients } from "./types";

// Rezeptkärtchen als PDF – Layout unverändert aus der Rezepte-App übernommen:
// A4 quer, 4 Karten à 120×90 mm pro Seite, feste Offsets (passend zum Ausschneiden/Kartenbox).

export const PDF_FILE_NAME = "rezepte-kaertchen.pdf";
export const CARDS_PER_PAGE = 4;

const CARD_WIDTH = 120;
const CARD_HEIGHT = 90;
const MARGIN = 5;
const LINE_HEIGHT = 4;
const OFFSET_X = 28.5;
const OFFSET_Y = 15;

const CARD_POSITIONS = [
  { x: OFFSET_X, y: OFFSET_Y },
  { x: OFFSET_X + CARD_WIDTH, y: OFFSET_Y },
  { x: OFFSET_X, y: OFFSET_Y + CARD_HEIGHT },
  { x: OFFSET_X + CARD_WIDTH, y: OFFSET_Y + CARD_HEIGHT },
];

function drawCard(doc: JsPDF, recipe: RecipeWithIngredients, offsetX: number, offsetY: number) {
  const leftCol = offsetX + MARGIN;
  const rightCol = offsetX + CARD_WIDTH / 2 + 2;
  const colWidth = CARD_WIDTH / 2 - MARGIN - 2;

  let y = offsetY + MARGIN * 2;

  doc.setDrawColor(180);
  doc.setLineWidth(0.03);
  doc.rect(offsetX, offsetY, CARD_WIDTH, CARD_HEIGHT);

  // Kategorie + Name als Titel
  const titleText = recipe.category ? `${recipe.category} - ${recipe.name}` : recipe.name;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(titleText, CARD_WIDTH - MARGIN * 2);
  doc.text(titleLines, offsetX + CARD_WIDTH / 2, y, { align: "center" });
  y += titleLines.length * 5 + 2;

  // Bemerkung (falls vorhanden)
  if (recipe.bemerkung) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    const bemerkungLines = doc.splitTextToSize(recipe.bemerkung, CARD_WIDTH - MARGIN * 2);
    doc.text(bemerkungLines, offsetX + CARD_WIDTH / 2, y, { align: "center" });
    y += bemerkungLines.length * 3 + 2;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(offsetX + MARGIN, y, offsetX + CARD_WIDTH - MARGIN, y);
  y += 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Zutat", leftCol, y);
  doc.text("Zubereitung", rightCol, y);
  y += 4;

  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  for (const ing of recipe.ingredients) {
    // Was nicht mehr auf die Karte passt, wird (wie im Original) weggelassen
    if (y > offsetY + CARD_HEIGHT - MARGIN - 4) continue;

    doc.setFont("helvetica", "normal");
    const ingLines = doc.splitTextToSize(`${ing.menge} ${ing.zutat}`, colWidth);

    doc.setFont("helvetica", "italic");
    const actionLines = doc.splitTextToSize(ing.taetigkeit || "", colWidth);

    const maxLines = Math.max(ingLines.length, actionLines.length);

    doc.setFont("helvetica", "normal");
    doc.text(ingLines, leftCol, y);

    doc.setFont("helvetica", "italic");
    doc.text(actionLines, rightCol, y);

    y += maxLines * LINE_HEIGHT + 1;
  }
}

/** Baut das PDF. jsPDF wird erst hier geladen, damit es nicht im Haupt-Bundle landet. */
export async function createRecipeCardsPdf(recipes: RecipeWithIngredients[]): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  recipes.forEach((recipe, index) => {
    const positionOnPage = index % CARDS_PER_PAGE;
    if (index > 0 && positionOnPage === 0) doc.addPage();
    const pos = CARD_POSITIONS[positionOnPage];
    drawCard(doc, recipe, pos.x, pos.y);
  });

  return doc;
}
