import { describe, expect, it } from "vitest";
import { bringDeeplink, bringItem, bringRecipeHtml, decodeBringList, encodeBringList } from "./bring";

describe("bring", () => {
  it("round-trips a list with umlauts", () => {
    const list = { title: "Einkaufszettel KW 47", items: ["300 g Mehl", "2 Möhren", "Öl"] };
    expect(decodeBringList(encodeBringList(list))).toEqual(list);
  });

  it("rejects invalid data", () => {
    expect(decodeBringList(null)).toBeNull();
    expect(decodeBringList("kaputt!")).toBeNull();
    expect(decodeBringList(encodeBringList({ title: "x", items: "nope" as unknown as string[] }))).toBeNull();
  });

  it("puts the amount before the ingredient", () => {
    expect(bringItem({ zutat: "Tomaten", amounts: ["300 g", "1 Dose"] })).toBe("300 g + 1 Dose Tomaten");
    expect(bringItem({ zutat: "Salz", amounts: [] })).toBe("Salz");
  });

  it("builds a deeplink pointing at the recipe page", () => {
    const link = new URL(bringDeeplink("https://app.example/", { title: "T", items: ["Ei"] }));
    expect(link.origin + link.pathname).toBe("https://api.getbring.com/rest/bringrecipes/deeplink");
    expect(link.searchParams.get("source")).toBe("web");
    const page = new URL(link.searchParams.get("url")!);
    expect(page.origin + page.pathname).toBe("https://app.example/api/bring/recipe");
    expect(decodeBringList(page.searchParams.get("d"))).toEqual({ title: "T", items: ["Ei"] });
  });

  it("escapes markup in the recipe page", () => {
    const html = bringRecipeHtml({ title: "<b>", items: ["</script><script>alert(1)</script>"] });
    expect(html).not.toContain("</script><script>");
    expect(html).toContain('"recipeIngredient":["\\u003c/script>');
    expect(html).toContain("<title>&lt;b&gt;</title>");
  });
});
