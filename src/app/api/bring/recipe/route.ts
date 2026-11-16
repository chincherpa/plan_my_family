import { decodeBringList, bringRecipeHtml } from "@/lib/recipes/bring";

// Öffentlich (ohne Anmeldung): Bring ruft die Seite von seinen Servern aus ab.
// Es werden nur die Daten aus der URL ausgegeben, kein Zugriff auf die Datenbank.
export function GET(request: Request) {
  const list = decodeBringList(new URL(request.url).searchParams.get("d"));
  if (!list) return new Response("Ungültiger Einkaufszettel", { status: 400 });
  return new Response(bringRecipeHtml(list), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Robots-Tag": "noindex",
    },
  });
}
