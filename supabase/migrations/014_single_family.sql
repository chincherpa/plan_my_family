-- Die App ist privat und gehört genau einer Familie.
-- Der Unique-Index auf einen konstanten Ausdruck erlaubt höchstens eine Zeile in families.
-- Schlägt fehl, wenn bereits mehr als eine Familie existiert.
create unique index if not exists families_single_row on families ((true));
