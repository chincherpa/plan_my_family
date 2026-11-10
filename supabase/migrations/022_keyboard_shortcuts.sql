-- Tastatur-Shortcuts, familienweit anpassbar.
--
-- Gespeichert werden nur Abweichungen von der Standardbelegung im Code
-- (src/lib/shortcuts/keymap.ts): Schlüssel ist die Aktions-ID, Wert die
-- Tastenkombination ("N", "Shift+D", "ArrowLeft") oder null für "deaktiviert".
-- Neue Aktionen brauchen dadurch keine Migration.

alter table families
  add column keyboard_shortcuts jsonb not null default '{}'::jsonb;

alter table families
  add constraint families_keyboard_shortcuts_is_object
  check (jsonb_typeof(keyboard_shortcuts) = 'object');
