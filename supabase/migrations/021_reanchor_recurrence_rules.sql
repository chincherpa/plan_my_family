-- Serienregeln auf lokalen Mittag des Starttags umverankern (Befund 1 + 2).
--
-- Das Kalenderformular hat DTSTART bisher auf die echte Startzeit gesetzt; bei
-- ganztägigen Terminen liegt die in UTC am Vortag, wodurch Wochentage, Monatstage
-- und COUNT falsch ausgewertet wurden. Neu: DTSTART = lokales Datum von
-- start_time um 12:00 UTC (siehe ruleAnchor in src/lib/utils/recurrence.ts).
--
-- Die Zeitzone Europe/Berlin ist bewusst fest eingetragen: Die App ist für eine
-- Familie gebaut, und die Tests pinnen dieselbe Zone.
--
-- Hinweis: Serien mit COUNT enden danach teils einen Termin früher/später als
-- bisher angezeigt — das ist die Korrektur.
--
-- VOR DEM ANWENDEN lesend prüfen (nur select):
--   select count(*) filter (where recurrence_rule is not null),
--          count(*) filter (where recurrence_rule is not null and recurrence_rule not like 'DTSTART:%')
--   from appointments;                              -- Regeln ohne DTSTART-Zeile: von Hand
--   select id, title, start_time, recurrence_rule from appointments
--   where anniversary_kind is not null and recurrence_rule not like '%T120000Z%';  -- beschädigte Jahrestage

-- 1) Beschädigte Jahrestage komplett neu setzen (Formular hat sie überschrieben).
update appointments
set recurrence_rule =
  'DTSTART:' || to_char(start_time at time zone 'Europe/Berlin', 'YYYYMMDD') || E'T120000Z\n' ||
  'RRULE:FREQ=YEARLY' ||
  case when to_char(start_time at time zone 'Europe/Berlin', 'MMDD') = '0229'
       then ';BYMONTH=2;BYMONTHDAY=-1' else '' end
where anniversary_kind is not null
  and recurrence_rule is not null
  and recurrence_rule not like '%T120000Z%';

-- 2) Alle übrigen Regeln: nur die DTSTART-Zeile ersetzen.
update appointments
set recurrence_rule = regexp_replace(
  recurrence_rule,
  '^DTSTART:[0-9TZ]+',
  'DTSTART:' || to_char(start_time at time zone 'Europe/Berlin', 'YYYYMMDD') || 'T120000Z'
)
where recurrence_rule like 'DTSTART:%'
  and recurrence_rule not like 'DTSTART:' || to_char(start_time at time zone 'Europe/Berlin', 'YYYYMMDD') || 'T120000Z%';
