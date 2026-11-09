-- Abhak-Status des Einkaufszettels, geteilt innerhalb der Familie.
--
-- Eine Zeile = ein abgehakter Eintrag. Nicht abgehakt = keine Zeile, Abhaken
-- ist also insert, Zurücknehmen delete. So gibt es keine Konflikte, wenn zwei
-- Personen gleichzeitig im Supermarkt abhaken.
--
--   week_start  Montag der Kalenderwoche (eindeutiger als KW + Jahr).
--   item_key    "<gericht>|<zutat>", beides getrimmt und kleingeschrieben.
--               Die Rezepte liegen in einem anderen Supabase-Projekt, daher
--               kein FK. Wird ein Gericht umbenannt, verfällt sein Haken.

create table shopping_checks (
  family_id uuid not null references families(id) on delete cascade,
  week_start date not null,
  item_key text not null,
  checked_at timestamptz not null default now(),
  primary key (family_id, week_start, item_key),
  constraint shopping_checks_week_start_is_monday check (extract(isodow from week_start) = 1),
  constraint shopping_checks_item_key_length check (char_length(item_key) between 3 and 300)
);

alter table shopping_checks enable row level security;

create policy shopping_checks_all on shopping_checks
  for all using (family_id in (select get_my_family_ids()))
  with check (family_id in (select get_my_family_ids()));

-- DELETE-Events per Realtime müssen family_id/week_start/item_key enthalten.
alter table shopping_checks replica identity full;
alter publication supabase_realtime add table shopping_checks;
