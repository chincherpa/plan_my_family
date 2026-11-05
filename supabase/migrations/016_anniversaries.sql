-- Jahrestage (Geburtstage, Hochzeitstage, Gedenktage …).
--
-- Ein Jahrestag ist kein eigenes Objekt, sondern ein ganztägiges Ereignis
-- (is_event, is_all_day) mit jährlicher RRULE in `appointments`. Dadurch
-- erscheint er ohne Sonderweg im Kalender, wird per Realtime synchronisiert
-- und lässt sich auch dort bearbeiten. Die beiden Spalten markieren die Serie
-- als Jahrestag für die Übersicht unter /anniversaries:
--
--   anniversary_kind       Art des Jahrestags; null = normaler Termin.
--   anniversary_year_known false, wenn das Ursprungsjahr unbekannt ist (z. B.
--                          Geburtstag ohne Jahrgang). start_time liegt dann in
--                          einem Platzhalterjahr und es wird kein Alter
--                          berechnet.
--
-- save_appointment_with_participants listet seine Spalten explizit auf und
-- fasst diese beiden nicht an: Bearbeiten im Kalenderformular erhält sie.

alter table appointments
  add column anniversary_kind text,
  add column anniversary_year_known boolean not null default true;

alter table appointments
  add constraint appointments_anniversary_kind_valid
  check (
    anniversary_kind is null
    or anniversary_kind in ('birthday', 'wedding', 'relationship', 'memorial', 'other')
  );
