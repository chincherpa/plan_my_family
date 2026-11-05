"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import type { AnniversaryKind, AppointmentWithParticipants } from "@/lib/supabase/types";
import {
  ANNIVERSARY_KINDS,
  ANNIVERSARY_KIND_ORDER,
  MONTHS_DE,
  anniversaryRecord,
  collectAnniversaries,
  formatDayMonth,
  formatDaysUntil,
  upcomingAnniversaries,
  validateAnniversary,
  type Anniversary,
  type UpcomingAnniversary,
} from "@/lib/anniversaries";
import { cn, hexToRgba, localDateStr, startOfDay } from "@/lib/utils";
import { EVENT_COLOR } from "@/components/calendar/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmDialog from "@/components/ui/confirm-dialog";

/** Wie weit "Demnächst" in die Zukunft schaut */
const SOON_DAYS = 30;

type KindFilter = AnniversaryKind | "all";

export default function AnniversariesView() {
  const { appointments, isLoading } = useDataStore();
  const [filter, setFilter] = useState<KindFilter>("all");
  const [editing, setEditing] = useState<Anniversary | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Bei jedem Rendern neu: die Seite läuft auch auf dem Wandtablet über Mitternacht.
  const today = startOfDay(new Date());
  const all = upcomingAnniversaries(collectAnniversaries(appointments), today);

  const kindCounts = new Map<AnniversaryKind, number>();
  for (const u of all) kindCounts.set(u.anniversary.kind, (kindCounts.get(u.anniversary.kind) ?? 0) + 1);

  const filtered = filter === "all" ? all : all.filter((u) => u.anniversary.kind === filter);
  const soon = filtered.filter((u) => u.daysUntil <= SOON_DAYS);

  // Nach Monat gruppiert, beginnend mit dem aktuellen Monat
  const byMonth: { month: number; items: UpcomingAnniversary[] }[] = [];
  for (let i = 0; i < 12; i++) {
    const month = ((today.getMonth() + i) % 12) + 1;
    const items = filtered
      .filter((u) => u.anniversary.month === month)
      .sort(
        (a, b) =>
          a.anniversary.day - b.anniversary.day ||
          a.anniversary.title.localeCompare(b.anniversary.title, "de")
      );
    if (items.length > 0) byMonth.push({ month, items });
  }

  const dialogOpen = isCreating || editing !== null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-3 py-5 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Jahrestage</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Geburtstage, Hochzeitstage &amp; Co. — erscheinen automatisch im Kalender.
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Jahrestag</span>
            <span className="sm:hidden">Neu</span>
          </Button>
        </div>

        {all.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              Alle · {all.length}
            </FilterChip>
            {ANNIVERSARY_KIND_ORDER.filter((k) => kindCounts.has(k)).map((k) => (
              <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
                {ANNIVERSARY_KINDS[k].emoji} {ANNIVERSARY_KINDS[k].label} · {kindCounts.get(k)}
              </FilterChip>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-[var(--muted-foreground)] py-8 text-center">Lädt …</p>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center space-y-3">
            <p className="text-4xl">🎂</p>
            <p className="font-medium">Noch keine Jahrestage eingetragen.</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Trage Geburtstage, Hochzeitstage oder Gedenktage ein — sie erscheinen jedes Jahr
              im Kalender, mit Alter bzw. Jubiläum.
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Ersten Jahrestag anlegen
            </Button>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Demnächst · {SOON_DAYS} Tage
              </h2>
              {soon.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  In den nächsten {SOON_DAYS} Tagen steht nichts an.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {soon.map((u) => (
                    <SoonCard key={u.anniversary.appointment.id} item={u} onOpen={() => setEditing(u.anniversary)} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Übers Jahr
              </h2>
              {byMonth.map(({ month, items }) => (
                <div key={month} className="space-y-1.5">
                  <h3 className="text-sm font-semibold">{MONTHS_DE[month - 1]}</h3>
                  <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
                    {items.map((u) => (
                      <Row key={u.anniversary.appointment.id} item={u} onOpen={() => setEditing(u.anniversary)} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setIsCreating(false);
          }
        }}
      >
        <DialogContent>
          {dialogOpen && (
            <AnniversaryForm
              key={editing?.appointment.id ?? "new"}
              existing={editing}
              onDone={() => {
                setEditing(null);
                setIsCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      )}
    >
      {children}
    </button>
  );
}

function countText(u: UpcomingAnniversary): string | null {
  return u.count != null ? ANNIVERSARY_KINDS[u.anniversary.kind].countLabel(u.count) : null;
}

function SoonCard({ item, onOpen }: { item: UpcomingAnniversary; onOpen: () => void }) {
  const a = item.anniversary;
  const isToday = item.daysUntil === 0;
  const count = countText(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:brightness-110"
      style={{
        backgroundColor: hexToRgba(EVENT_COLOR, isToday ? 0.25 : 0.1),
        boxShadow: `inset 0 0 0 1px ${hexToRgba(EVENT_COLOR, isToday ? 0.6 : 0.3)}`,
      }}
    >
      <span className="text-3xl">{ANNIVERSARY_KINDS[a.kind].emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{a.title}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {item.date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })}
          {count && <> · {count}</>}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular",
          isToday ? "text-white" : "text-[var(--foreground)]"
        )}
        style={{ backgroundColor: isToday ? EVENT_COLOR : hexToRgba(EVENT_COLOR, 0.2) }}
      >
        {formatDaysUntil(item.daysUntil)}
      </span>
    </button>
  );
}

function Row({ item, onOpen }: { item: UpcomingAnniversary; onOpen: () => void }) {
  const a = item.anniversary;
  const count = countText(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-[var(--accent)]"
    >
      <span className="w-10 shrink-0 text-center text-sm font-semibold tabular text-[var(--muted-foreground)]">
        {a.day}.
      </span>
      <span className="text-xl">{ANNIVERSARY_KINDS[a.kind].emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{a.title}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {ANNIVERSARY_KINDS[a.kind].label}
          {a.year !== null && <> · seit {a.year}</>}
          {count && <> · {count}</>}
          {a.isLegacy && <> · aus dem Kalender</>}
        </p>
      </div>
      <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatDaysUntil(item.daysUntil)}</span>
    </button>
  );
}

function AnniversaryForm({ existing, onDone }: { existing: Anniversary | null; onDone: () => void }) {
  const { family, addAppointment, updateAppointment, removeAppointment, appointments } = useDataStore();
  const [kind, setKind] = useState<AnniversaryKind>(existing?.kind ?? "birthday");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [day, setDay] = useState(existing ? String(existing.day) : "");
  const [month, setMonth] = useState(existing ? String(existing.month) : String(new Date().getMonth() + 1));
  const [year, setYear] = useState(existing?.year != null ? String(existing.year) : "");
  const [notes, setNotes] = useState(existing?.appointment.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const info = ANNIVERSARY_KINDS[kind];
  const next = existing ? upcomingAnniversaries([existing], new Date())[0] : null;

  async function handleSave() {
    if (!family) return;
    const input = {
      kind,
      title,
      day: Number(day),
      month: Number(month),
      year: year.trim() ? Number(year) : null,
      notes,
    };
    const invalid = validateAnniversary(input, new Date());
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const record = anniversaryRecord(input);
    const select = "*, participants:appointment_participants(*)";

    if (existing) {
      const { data, error: saveError } = await supabase
        .from("appointments")
        .update(record)
        .eq("id", existing.appointment.id)
        .select(select)
        .single();
      if (saveError || !data) {
        setError(saveError?.message ?? "Jahrestag konnte nicht gespeichert werden.");
        setSaving(false);
        return;
      }
      updateAppointment(existing.appointment.id, data as AppointmentWithParticipants);
    } else {
      const { data, error: saveError } = await supabase
        .from("appointments")
        .insert({ ...record, family_id: family.id })
        .select(select)
        .single();
      if (saveError || !data) {
        setError(saveError?.message ?? "Jahrestag konnte nicht angelegt werden.");
        setSaving(false);
        return;
      }
      addAppointment(data as AppointmentWithParticipants);
    }
    setSaving(false);
    onDone();
  }

  async function handleDelete() {
    if (!existing) return;
    setSaving(true);
    const supabase = createClient();
    // Ausnahmen der Serie hängen per FK (on delete cascade) am Elternteil.
    const { error: deleteError } = await supabase
      .from("appointments")
      .delete()
      .eq("id", existing.appointment.id);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    appointments
      .filter((a) => a.recurrence_parent_id === existing.appointment.id)
      .forEach((a) => removeAppointment(a.id));
    removeAppointment(existing.appointment.id);
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? "Jahrestag bearbeiten" : "Neuer Jahrestag"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {existing?.isLegacy && (
          <p className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            Dieses jährliche Ereignis wurde im Kalender angelegt. Ergänze Art und — falls bekannt —
            das Jahr, dann wird auch das Alter bzw. Jubiläum angezeigt.
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Art</Label>
          <div className="flex flex-wrap gap-1.5">
            {ANNIVERSARY_KIND_ORDER.map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
                {ANNIVERSARY_KINDS[k].emoji} {ANNIVERSARY_KINDS[k].label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="anniversary-title">Bezeichnung</Label>
          <Input
            id="anniversary-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={info.placeholder}
            autoFocus={!existing}
          />
        </div>

        <div className="grid grid-cols-[4.5rem_1fr_6rem] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="anniversary-day">Tag</Label>
            <Input
              id="anniversary-day"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="TT"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Monat</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_DE.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anniversary-year">Jahr</Label>
            <Input
              id="anniversary-year"
              type="number"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-[var(--muted-foreground)]">
          Mit Jahr wird {kind === "birthday" ? "das Alter" : "das Jubiläum"} berechnet.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="anniversary-notes">Notizen</Label>
          <textarea
            id="anniversary-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="z.B. Geschenkideen, Adresse für die Karte …"
            rows={2}
            className="w-full rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          />
        </div>

        {next && (
          <Link
            href={`/calendar?day=${localDateStr(next.date)}`}
            className="flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <CalendarDays className="w-4 h-4" />
            Im Kalender zeigen ({formatDayMonth(existing!)} {next.date.getFullYear()})
          </Link>
        )}

        {error && (
          <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {existing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="text-[var(--destructive)] hover:text-[var(--destructive)]"
              title="Löschen"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onDone}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || !title.trim() || !day}>
            {saving ? "Speichern …" : "Speichern"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`„${existing?.title ?? ""}“ löschen?`}
        description="Der Jahrestag verschwindet auch aus dem Kalender."
        onConfirm={handleDelete}
      />
    </>
  );
}
