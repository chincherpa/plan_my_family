"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, Copy, Download, FileUp, Repeat, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import {
  MAX_IMPORT_BYTES,
  normalizeAll,
  parseImportCsv,
  personNamesIn,
  resolveEntries,
  unmatchedNames,
  vehicleNamesIn,
  type ImportEntry,
  type NameMap,
  type NameUsage,
  type ResolvedEntry,
} from "@/lib/import/appointmentImport";
import { buildTemplateCsv } from "@/lib/import/exampleFile";
import { saveResolvedEntries, type ImportOutcome } from "@/lib/import/saveImport";
import type { FamilyMember } from "@/lib/supabase/types";
import { formatDate, formatTime, localDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Phase = "pick" | "review" | "importing" | "done";

/** Wert der Auswahlliste für „bewusst nicht übernehmen“. */
const IGNORE = "__ignore__";
const PREVIEW_LIMIT = 200;

const selectClass =
  "h-8 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]";

function whenLabel(entry: ImportEntry): string {
  if (entry.allDay) {
    const sameDay = localDateStr(entry.start) === localDateStr(entry.end);
    return sameDay
      ? `${formatDate(entry.start)} · ganztägig`
      : `${formatDate(entry.start)} – ${formatDate(entry.end)} · ganztägig`;
  }
  const sameDay = localDateStr(entry.start) === localDateStr(entry.end);
  return sameDay
    ? `${formatDate(entry.start)} · ${formatTime(entry.start)}–${formatTime(entry.end)}`
    : `${formatDate(entry.start)} ${formatTime(entry.start)} – ${formatDate(entry.end)} ${formatTime(entry.end)}`;
}

/** Zugeordnete Namen aus der App, solange es noch keine Zuordnung gibt: die Schreibweise der Datei. */
function whoLabel(row: ResolvedEntry, members: FamilyMember[]): string {
  const { entry, appointment, participants } = row;
  if (entry.event) return "Ereignis";
  if (entry.everyone) return "Alle";
  if (appointment && participants) {
    const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name;
    return [nameOf(appointment.owner_id), ...participants.map((p) => nameOf(p.member_id))]
      .filter(Boolean)
      .join(", ");
  }
  return [entry.owner, ...entry.participants.map((p) => p.name)].filter(Boolean).join(", ");
}

function NameMapRow({
  usage,
  value,
  options,
  onChange,
}: {
  usage: NameUsage;
  value: string | null | undefined;
  options: { id: string; label: string }[];
  onChange: (value: string | null | undefined) => void;
}) {
  const selected = value === undefined ? "" : value === null ? IGNORE : value;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate">
        „{usage.name}“ <span className="text-[var(--muted-foreground)]">({usage.count}×)</span>
      </span>
      <span className="text-[var(--muted-foreground)]">→</span>
      <select
        className={`${selectClass} w-44 ${selected === "" ? "border-[var(--warning)]" : ""}`}
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : v === IGNORE ? null : v);
        }}
      >
        <option value="">Bitte wählen …</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value={IGNORE}>– ignorieren –</option>
      </select>
    </div>
  );
}

function StatusIcon({ status }: { status: ResolvedEntry["status"] }) {
  if (status === "ok") return <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="importierbar" />;
  if (status === "duplicate") {
    return <Copy className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-label="bereits vorhanden" />;
  }
  return <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--destructive)]" aria-label="Fehler" />;
}

export default function AppointmentImportSettings() {
  const { family, members, vehicles, appointments, setAppointments } = useDataStore();

  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [personMap, setPersonMap] = useState<NameMap>({});
  const [vehicleMap, setVehicleMap] = useState<NameMap>({});
  const [importDuplicates, setImportDuplicates] = useState<ReadonlySet<number>>(new Set());
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolved = useMemo(
    () =>
      family
        ? resolveEntries(entries, {
            familyId: family.id,
            members,
            vehicles,
            existing: appointments,
            personMap,
            vehicleMap,
            importDuplicates,
          })
        : [],
    [family, entries, members, vehicles, appointments, personMap, vehicleMap, importDuplicates]
  );
  const openPersons = useMemo(() => unmatchedNames(personNamesIn(entries), members), [entries, members]);
  const openVehicles = useMemo(() => unmatchedNames(vehicleNamesIn(entries), vehicles), [entries, vehicles]);

  const counts = useMemo(() => {
    const c = { ok: 0, duplicate: 0, error: 0, duplicateTotal: 0 };
    for (const r of resolved) {
      c[r.status] += 1;
      if (r.duplicate) c.duplicateTotal += 1;
    }
    return c;
  }, [resolved]);

  const templateText = useMemo(() => buildTemplateCsv(members, vehicles), [members, vehicles]);

  function reset() {
    setPhase("pick");
    setFileName("");
    setEntries([]);
    setFileErrors([]);
    setPersonMap({});
    setVehicleMap({});
    setOutcome(null);
    setOnlyProblems(false);
    setImportDuplicates(new Set());
  }

  async function handleFile(file: File) {
    setFileErrors([]);
    if (file.size > MAX_IMPORT_BYTES) {
      setFileErrors([`Die Datei ist zu groß (maximal ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`]);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileErrors(["Die Datei konnte nicht gelesen werden."]);
      return;
    }
    const parsed = parseImportCsv(text);
    if (parsed.fileErrors.length > 0) {
      setFileErrors(parsed.fileErrors);
      return;
    }
    setEntries(normalizeAll(parsed.items));
    setPersonMap({});
    setVehicleMap({});
    setFileName(file.name);
    setPhase("review");
  }

  function toggleDuplicate(index: number, allow: boolean) {
    setImportDuplicates((prev) => {
      const next = new Set(prev);
      if (allow) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function setAllDuplicates(allow: boolean) {
    setImportDuplicates(allow ? new Set(resolved.filter((r) => r.duplicate).map((r) => r.entry.index)) : new Set());
  }

  function setMapping(
    setter: React.Dispatch<React.SetStateAction<NameMap>>,
    key: string,
    value: string | null | undefined
  ) {
    setter((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function handleImport() {
    const rows = resolved.filter((r) => r.status === "ok");
    if (rows.length === 0) return;
    setPhase("importing");
    setProgress({ done: 0, total: rows.length });
    const result = await saveResolvedEntries(createClient(), rows, (done, total) =>
      setProgress({ done, total })
    );

    // Realtime lädt nach, kann aber vor oder nach uns fertig sein — nach Id zusammenführen,
    // damit nichts doppelt erscheint.
    const ids = new Set(result.saved.map((a) => a.id));
    const current = useDataStore.getState().appointments;
    setAppointments([...current.filter((a) => !ids.has(a.id)), ...result.saved]);

    // Löschmarker ausgefallener Serientermine sind keine eigenen Termine
    setImportedCount(result.saved.filter((a) => !a.is_deleted).length);
    setOutcome(result);
    setPhase("done");
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateText], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "termine-vorlage.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const visibleRows = (onlyProblems ? resolved.filter((r) => r.status !== "ok" || r.duplicate || r.warnings.length > 0) : resolved);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-3 py-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Termine importieren</h1>
        </div>

        {phase === "pick" && (
          <>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                Mehrere Termine auf einmal anlegen: die CSV-Vorlage laden, in Excel oder einem Editor
                ausfüllen (eine Zeile pro Termin), hier auswählen, Vorschau prüfen, importieren.
                Einzeltermine, ganztägige Termine, Ereignisse und Serientermine werden unterstützt,
                ebenso ein Besitzer plus weitere Teilnehmer.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => inputRef.current?.click()} disabled={!family}>
                  <FileUp className="w-4 h-4" />
                  Datei auswählen
                </Button>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4" />
                  CSV-Vorlage herunterladen
                </Button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // dieselbe Datei erneut wählbar
                  if (file) void handleFile(file);
                }}
              />
              {fileErrors.length > 0 && (
                <div className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)] space-y-0.5">
                  {fileErrors.map((message, i) => (
                    <p key={i}>{message}</p>
                  ))}
                </div>
              )}
            </div>

            <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
              <summary className="cursor-pointer font-medium">Spalten der Vorlage</summary>
              <div className="mt-3 space-y-3 text-[var(--muted-foreground)]">
                <p>
                  Eine Zeile pro Termin, die Kopfzeile bleibt stehen. Pflicht sind nur <code>title</code> und{" "}
                  <code>start</code>. Zeiten sind lokale Zeiten (<code>2026-11-10T17:00</code> oder{" "}
                  <code>10.11.2026 17:00</code>), ein reines Datum (<code>2026-12-24</code>) ist ganztägig.
                  Trennzeichen sind Semikolon, Komma oder Tabulator.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><code>end</code> oder <code>duration</code> (Minuten) — sonst 60 Minuten; bei ganztägigen Terminen ist <code>end</code> der letzte Tag</li>
                  <li><code>allDay</code>, <code>event</code>, <code>everyone</code> — <code>ja</code> oder <code>nein</code>; „event“ = Ereignis (Geburtstag, Feiertag), „everyone“ = Familientermin (Spalte „Alle“)</li>
                  <li><code>owner</code> — Name des Familienmitglieds; <code>participants</code> — weitere Teilnehmer, mit <code>|</code> getrennt, ein <code>*</code> dahinter markiert die Aufsichtsperson (<code>Ben|Clara*</code>)</li>
                  <li><code>repeat</code> — <code>daily</code>, <code>weekdays</code>, <code>weekend</code>, <code>weekly</code>, <code>biweekly</code>, <code>monthly</code>, <code>yearly</code> oder ein RRULE-Text aus einem iCal-Export</li>
                  <li><code>repeatInterval</code>, <code>repeatDays</code> (<code>MO|WE</code>), <code>repeatUntil</code> / <code>repeatCount</code>, <code>repeatSkip</code> (ausgefallene Tage, mit <code>|</code> getrennt)</li>
                  <li><code>notes</code>, <code>vehicle</code>, <code>travelBefore</code>, <code>travelAfter</code> (Minuten)</li>
                </ul>
                <pre className="max-h-72 overflow-auto rounded-md bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">
                  {templateText}
                </pre>
              </div>
            </details>
          </>
        )}

        {phase === "review" && (
          <>
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-1">
              <p className="font-medium break-all">{fileName}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {entries.length} Termine gefunden —{" "}
                <span className="font-medium text-[var(--foreground)]">{counts.ok} importierbar</span>
                {counts.duplicate > 0 && `, ${counts.duplicate} Duplikate werden übersprungen`}
                {counts.error > 0 && (
                  <>
                    , <span className="font-medium text-[var(--destructive)]">{counts.error} mit Fehlern</span>
                  </>
                )}
              </p>
            </div>

            {(openPersons.length > 0 || openVehicles.length > 0) && (
              <div className="p-4 rounded-xl border border-[var(--warning)]/50 bg-[var(--warning)]/10 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--warning)]" />
                  Diese Namen aus der Datei kennt die App nicht — bitte zuordnen
                </p>
                <div className="space-y-2">
                  {openPersons.map((usage) => (
                    <NameMapRow
                      key={`p-${usage.key}`}
                      usage={usage}
                      value={personMap[usage.key]}
                      options={members.map((m) => ({ id: m.id, label: m.name }))}
                      onChange={(v) => setMapping(setPersonMap, usage.key, v)}
                    />
                  ))}
                  {openVehicles.map((usage) => (
                    <NameMapRow
                      key={`v-${usage.key}`}
                      usage={usage}
                      value={vehicleMap[usage.key]}
                      options={vehicles.map((v) => ({ id: v.id, label: `${v.icon_emoji} ${v.name}` }))}
                      onChange={(v) => setMapping(setVehicleMap, usage.key, v)}
                    />
                  ))}
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  „Ignorieren“ lässt die Person bzw. das Fahrzeug weg; Termine, die ohne Person dastehen
                  würden, werden nicht importiert.
                </p>
              </div>
            )}

{counts.duplicateTotal > 0 && (
              <div className="p-4 rounded-xl border border-[var(--warning)]/50 bg-[var(--warning)]/10 space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--warning)]" />
                  {counts.duplicateTotal === 1
                    ? "1 Termin ist bereits vorhanden oder kommt in der Datei doppelt vor"
                    : `${counts.duplicateTotal} Termine sind bereits vorhanden oder kommen in der Datei doppelt vor`}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Gleicher Titel und gleiche Zeit. Standardmäßig werden sie übersprungen — in der Vorschau
                  kannst du einzelne Duplikate trotzdem anlegen lassen.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAllDuplicates(false)}>
                    Alle überspringen
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAllDuplicates(true)}>
                    Alle trotzdem importieren
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Vorschau
                </h2>
                <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(e) => setOnlyProblems(e.target.checked)}
                  />
                  nur Auffälligkeiten
                </label>
              </div>
              {visibleRows.length === 0 && (
                <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">Keine Auffälligkeiten.</p>
              )}
              {visibleRows.slice(0, PREVIEW_LIMIT).map((row) => (
                <div
                  key={row.entry.index}
                  className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5"
                >
                  <StatusIcon status={row.status} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{row.entry.title || `Eintrag ${row.entry.index}`}</span>
                      {row.entry.recurrence && (
                        <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-[var(--muted-foreground)]">
                          <Repeat className="h-3 w-3" />
                          Serie
                          {row.skipCount > 0 && `, ${row.skipCount} ausgefallen`}
                        </span>
                      )}
                    </p>
                    {!isNaN(row.entry.start.getTime()) && (
                      <p className="text-xs text-[var(--muted-foreground)] tabular">
                        {whenLabel(row.entry)}
                        {whoLabel(row, members) && ` · ${whoLabel(row, members)}`}
                      </p>
                    )}
                    {row.errors.map((message, i) => (
                      <p key={`e${i}`} className="text-xs text-[var(--destructive)]">
                        {message}
                      </p>
                    ))}
                    {row.warnings.slice(0, 3).map((message, i) => (
                      <p key={`w${i}`} className="text-xs text-[var(--warning)]">
                        {message}
                      </p>
                    ))}
                    {row.warnings.length > 3 && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        … und {row.warnings.length - 3} weitere Hinweise
                      </p>
                    )}
                  </div>
                  {row.duplicate && (
                    <label className="flex shrink-0 items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={importDuplicates.has(row.entry.index)}
                        onChange={(e) => toggleDuplicate(row.entry.index, e.target.checked)}
                      />
                      trotzdem anlegen
                    </label>
                  )}
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)] tabular">#{row.entry.index}</span>
                </div>
              ))}
              {visibleRows.length > PREVIEW_LIMIT && (
                <p className="py-2 text-center text-sm text-[var(--muted-foreground)]">
                  … und {visibleRows.length - PREVIEW_LIMIT} weitere (alle werden importiert)
                </p>
              )}
            </div>

            <div className="flex gap-2 pb-4">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Abbrechen
              </Button>
              <Button className="flex-1" onClick={handleImport} disabled={counts.ok === 0}>
                {counts.ok === 1 ? "1 Termin importieren" : `${counts.ok} Termine importieren`}
              </Button>
            </div>
          </>
        )}

        {phase === "importing" && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
            <p className="font-medium">
              Importiere … {progress.done} von {progress.total}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full bg-[var(--primary)] transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">Bitte diese Seite offen lassen.</p>
          </div>
        )}

        {phase === "done" && outcome && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 text-emerald-600" />
                {importedCount === 1 ? "1 Termin importiert" : `${importedCount} Termine importiert`}
              </p>
              {counts.duplicate > 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">{counts.duplicate} Duplikate übersprungen.</p>
              )}
              {counts.error > 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">{counts.error} wegen Fehlern nicht importiert.</p>
              )}
            </div>
            {outcome.failures.length > 0 && (
              <div className="rounded-xl bg-[var(--destructive)]/10 p-4 text-sm text-[var(--destructive)] space-y-1">
                <p className="font-medium">Beim Speichern ist etwas schiefgegangen:</p>
                {outcome.failures.map((f, i) => (
                  <p key={i}>
                    #{f.index} „{f.title}“: {f.message}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Weitere Datei importieren
              </Button>
              <Link href="/calendar" className="flex-1">
                <Button className="w-full">Zum Kalender</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
