-- supabase/migrations/011_meal_catalog.sql
--
-- Adds a per-family catalog of dish names + categories, used to power a
-- combobox in the meal-plan dialog (suggestions, not a constraint —
-- meals.lunch/dinner stay free text; see 007_meals_free_text.sql). This is
-- a suggestion list only, not a return to the recipes/meal_plans model that
-- 007 removed: there's no FK from meals to this table.
--
-- Categories are plain text, not an enum — users can create new ones freely
-- from the settings UI.

create table meal_catalog (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

create index meal_catalog_family_id_idx on meal_catalog (family_id);

alter table meal_catalog enable row level security;

create policy meal_catalog_all on meal_catalog
  for all using (family_id in (select get_my_family_ids()));

alter table meal_catalog replica identity full;

-- Seed every existing family with 50 vegetarian starter dishes across 10
-- categories. Families created after this migration runs don't get seeded
-- automatically — acceptable for this app's scale (one or a handful of
-- families), and consistent with there being no other seed-on-create logic.
insert into meal_catalog (family_id, name, category)
select f.id, v.name, v.category
from families f
cross join (
  values
    ('Spaghetti Aglio e Olio', 'Pasta'),
    ('Penne all''Arrabbiata', 'Pasta'),
    ('Pasta mit Tomatensoße', 'Pasta'),
    ('Pasta mit Pesto', 'Pasta'),
    ('Lasagne mit Gemüse', 'Pasta'),
    ('Mac and Cheese', 'Pasta'),

    ('Linsen-Curry', 'Hülsenfrüchte'),
    ('Chili sin Carne', 'Hülsenfrüchte'),
    ('Kichererbsen-Curry', 'Hülsenfrüchte'),
    ('Falafel mit Hummus', 'Hülsenfrüchte'),
    ('Linsensuppe mit Gemüse', 'Hülsenfrüchte'),
    ('Bohneneintopf', 'Hülsenfrüchte'),

    ('Kürbissuppe', 'Suppen'),
    ('Tomatensuppe', 'Suppen'),
    ('Brokkoli-Suppe', 'Suppen'),
    ('Möhren-Ingwer-Suppe', 'Suppen'),
    ('Minestrone', 'Suppen'),

    ('Kartoffelgratin', 'Aufläufe'),
    ('Gemüseauflauf', 'Aufläufe'),
    ('Nudelauflauf mit Käse', 'Aufläufe'),
    ('Blumenkohlauflauf', 'Aufläufe'),
    ('Zucchini-Auflauf', 'Aufläufe'),

    ('Gemüse-Kokos-Curry', 'Currys'),
    ('Rote-Linsen-Dal', 'Currys'),
    ('Thai-Curry mit Tofu', 'Currys'),
    ('Kartoffel-Spinat-Curry', 'Currys'),
    ('Kürbis-Curry', 'Currys'),

    ('Gemüse-Wok mit Tofu', 'Pfannengerichte'),
    ('Gebratener Reis mit Gemüse', 'Pfannengerichte'),
    ('Pfannengemüse mit Halloumi', 'Pfannengerichte'),
    ('Süßkartoffel-Pfanne', 'Pfannengerichte'),
    ('Gemüsepfanne mit Ei', 'Pfannengerichte'),

    ('Ofengemüse mit Feta', 'Ofengerichte'),
    ('Gefüllte Paprika', 'Ofengerichte'),
    ('Gebackene Süßkartoffel', 'Ofengerichte'),
    ('Gemüse-Kartoffel-Blech', 'Ofengerichte'),
    ('Gefüllte Zucchini', 'Ofengerichte'),

    ('Griechischer Salat', 'Salate'),
    ('Quinoa-Salat', 'Salate'),
    ('Couscous-Salat', 'Salate'),
    ('Caprese-Salat', 'Salate'),
    ('Linsensalat', 'Salate'),

    ('Gemüseeintopf', 'Eintöpfe'),
    ('Kartoffeleintopf', 'Eintöpfe'),
    ('Kürbis-Kokos-Eintopf', 'Eintöpfe'),
    ('Erbseneintopf', 'Eintöpfe'),

    ('Gemüse-Risotto', 'Sonstiges'),
    ('Ratatouille', 'Sonstiges'),
    ('Shakshuka', 'Sonstiges'),
    ('Veggie-Burger mit Pommes', 'Sonstiges')
) as v(name, category)
on conflict (family_id, name) do nothing;
