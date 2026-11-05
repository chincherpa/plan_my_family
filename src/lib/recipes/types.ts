// Zeilen der separaten Rezepte-App (eigenes Supabase-Projekt).
// recipes.category enthält den Namen einer Kategorie (kein FK auf categories).

export type Recipe = {
  id: number;
  name: string;
  category: string;
  /** NOT NULL in der Rezept-DB — leer ist "" */
  bemerkung: string;
};

export type RecipeCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

export type RecipeInput = {
  name: string;
  category: string;
  bemerkung: string;
};

export type ActionResult<T> = { data: T } | { error: string };
