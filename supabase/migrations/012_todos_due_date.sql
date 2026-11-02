-- Optional due date ("Endtermin") for a todo. A plain date (no time): a todo is
-- a deadline-by-day, not a timed event. Todos with a due date surface in the
-- calendar on the assignee's column (Bearbeiter) — or the "Alle" column when
-- unassigned — on that day.

alter table todos add column due_date date;
