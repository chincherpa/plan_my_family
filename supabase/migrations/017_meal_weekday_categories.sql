-- Essenskategorie pro Wochentag (z. B. Montag = Pasta, Mittwoch = Suppe).
--
-- Schlüssel ist der JS-Wochentag als Text ("0" = Sonntag … "6" = Samstag),
-- Wert der Name einer Kategorie aus der Rezepte-App (recipes.category). Kein
-- FK möglich, die Kategorien liegen in einem anderen Supabase-Projekt. Fehlt
-- ein Wochentag, gibt es für ihn keine Vorauswahl.

alter table families
  add column meal_weekday_categories jsonb not null default '{}'::jsonb;

alter table families
  add constraint families_meal_weekday_categories_is_object
  check (jsonb_typeof(meal_weekday_categories) = 'object');
