"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Mic, MicOff, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDataStore } from "@/lib/store/dataStore";
import { useCalendarStore } from "@/lib/store/calendarStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSpeechRecognition } from "@/lib/voice/useSpeechRecognition";
import { describeQuery, runVoiceQuery, spokenAnswer, type QueryHit } from "@/lib/voice/queryAppointments";
import { useSpeechSynthesis } from "@/lib/voice/useSpeechSynthesis";
import { Checkbox } from "@/components/ui/checkbox";
import type { VoiceQuery } from "@/lib/voice/appointmentFromText";
import { ANNIVERSARY_KINDS, formatDaysUntil } from "@/lib/anniversaries";
import { formatTime } from "@/lib/utils";
import type { AppointmentWithParticipants, Json } from "@/lib/supabase/types";

/** Antwort von POST /api/appointments/from-text: Vorschau eines Termins (`preview: true`) oder eine Frage. */
interface PreviewResponse {
  preview: {
    appointment: {
      title: string;
      notes: string | null;
      start_time: string;
      end_time: string;
      is_all_day: boolean;
      is_all_family: boolean;
    };
    extracted: { person: string | null };
    warnings: string[];
  };
}

interface ErrorResponse {
  error?: string;
  message?: string;
  missing?: string[];
  invalid?: { message: string }[];
}

const READ_ALOUD_KEY = "voice-read-aloud";

function loadReadAloud(): boolean {
  try {
    return localStorage.getItem(READ_ALOUD_KEY) === "1";
  } catch {
    return false;
  }
}

const FIELD_LABELS: Record<string, string> = { title: "Titel", date: "Datum", start_time: "Uhrzeit" };

type Phase = "input" | "loading" | "preview" | "saving" | "answer";

function describeHit(hit: QueryHit): string {
  const now = new Date();
  const date = hit.start.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(hit.start.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
  const time = hit.allDay ? "" : `, ${formatTime(hit.start)}–${formatTime(hit.end)} Uhr`;
  return `${date}${time} · ${formatDaysUntil(hit.daysUntil)}`;
}

/**
 * Schwebender Mikrofon-Button: Termin sprechen oder tippen (Vorschau prüfen, speichern)
 * oder nach Terminen und Geburtstagen fragen.
 */
export default function VoiceAppointment() {
  const router = useRouter();
  const addAppointment = useDataStore((s) => s.addAppointment);
  const appointments = useDataStore((s) => s.appointments);
  const members = useDataStore((s) => s.members);
  const schoolHolidays = useDataStore((s) => s.schoolHolidays);
  const setFocusedDate = useCalendarStore((s) => s.setFocusedDate);
  const speech = useSpeechRecognition();
  const synth = useSpeechSynthesis();
  // Standardmäßig aus; die Wahl bleibt im Browser gespeichert.
  const [readAloud, setReadAloud] = useState(loadReadAloud);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResponse["preview"] | null>(null);
  const [answer, setAnswer] = useState<{ query: VoiceQuery; hits: QueryHit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Laufende Auswertung; wird beim Schließen abgebrochen. */
  const requestRef = useRef<AbortController | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      requestRef.current?.abort();
      speech.abort();
      synth.cancel();
      setPhase("input");
      setText("");
      setPreview(null);
      setAnswer(null);
      setError(null);
    }
  }

  function changeReadAloud(checked: boolean) {
    setReadAloud(checked);
    if (!checked) synth.cancel();
    try {
      localStorage.setItem(READ_ALOUD_KEY, checked ? "1" : "0");
    } catch {
      // Ohne Speicher bleibt die Wahl nur für diese Sitzung.
    }
  }

  function toggleListening() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    const base = text.trim();
    speech.start((heard) => setText(base ? `${base} ${heard}` : heard));
  }

  async function analyze() {
    const trimmed = text.trim();
    if (!trimmed) return;
    speech.abort();
    setError(null);
    setPhase("loading");
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const res = await fetch("/api/appointments/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, preview: true }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as (PreviewResponse & ErrorResponse & { query?: VoiceQuery }) | null;
      // Dialog inzwischen geschlossen oder neu gefragt → Ergebnis verwerfen
      if (controller.signal.aborted) return;

      if (res.ok && data?.preview) {
        setPreview(data.preview);
        setPhase("preview");
        return;
      }
      if (res.ok && data?.query) {
        // Frage: Claude hat sie nur verstanden, die Antwort kommt aus den geladenen Terminen.
        const hits = runVoiceQuery(data.query, { appointments, members, schoolHolidays });
        setAnswer({ query: data.query, hits });
        setPhase("answer");
        if (readAloud) synth.speak(spokenAnswer(data.query, hits));
        return;
      }
      if (res.status === 422 && data) {
        const missing = (data.missing ?? []).map((f) => FIELD_LABELS[f] ?? f);
        const invalid = (data.invalid ?? []).map((p) => p.message);
        setError(
          missing.length > 0
            ? `Es fehlt noch: ${[...missing, ...invalid].join(", ")}. Ergänze den Text und versuche es erneut.`
            : invalid.join(" ") || data.message || "Der Termin ist nicht vollständig."
        );
      } else if (res.status === 401) {
        setError("Du bist nicht mehr angemeldet. Bitte die Seite neu laden.");
      } else {
        setError(data?.message ?? "Der Text konnte nicht ausgewertet werden.");
      }
    } catch {
      if (controller.signal.aborted) return;
      setError("Keine Verbindung zum Server.");
    }
    setPhase("input");
  }

  async function save() {
    if (!preview) return;
    setError(null);
    setPhase("saving");
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("save_appointment_with_participants", {
      appointment_data: preview.appointment as unknown as Json,
      participant_data: [],
    });
    if (rpcError || !data) {
      console.error("Termin konnte nicht gespeichert werden.", rpcError);
      setError("Der Termin konnte nicht gespeichert werden.");
      setPhase("preview");
      return;
    }
    const saved = data as unknown as AppointmentWithParticipants;
    addAppointment(saved);
    setFocusedDate(new Date(saved.start_time));
    handleOpenChange(false);
    router.push("/calendar");
  }

  function showInCalendar(hit: QueryHit) {
    setFocusedDate(hit.start);
    handleOpenChange(false);
    router.push("/calendar");
  }

  const appt = preview?.appointment;
  const start = appt ? new Date(appt.start_time) : null;
  const end = appt ? new Date(appt.end_time) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sprachassistent"
        title="Sprachassistent: Termin ansagen oder nach Terminen fragen"
        className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:bottom-6"
      >
        <Mic className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Sprachassistent</DialogTitle>
          </DialogHeader>

          {(phase === "input" || phase === "loading") && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
                }}
                placeholder="Termin ansagen („Morgen um halb vier Zahnarzt mit Ben“) oder fragen („Wann ist der nächste Geburtstag?“)"
                rows={3}
                maxLength={2000}
                autoFocus
                disabled={phase === "loading"}
                className="w-full resize-none rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              />
              {!speech.supported && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Dieser Browser hat keine eingebaute Spracherkennung. Tippe den Text oder nutze das Mikrofon deiner
                  Tastatur (Diktierfunktion).
                </p>
              )}
              {(error || speech.error) && (
                <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                  {error ?? speech.error}
                </p>
              )}
              <div className="flex items-center gap-2">
                {speech.supported && (
                  <Button
                    type="button"
                    variant={speech.listening ? "destructive" : "outline"}
                    onClick={toggleListening}
                    disabled={phase === "loading"}
                  >
                    {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {speech.listening ? "Stopp" : "Sprechen"}
                  </Button>
                )}
                {synth.supported && (
                  <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                    <Checkbox checked={readAloud} onCheckedChange={changeReadAloud} aria-label="Antworten vorlesen" />
                    Vorlesen
                  </label>
                )}
                <Button
                  type="button"
                  className="ml-auto"
                  onClick={analyze}
                  disabled={!text.trim() || phase === "loading"}
                >
                  {phase === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Los
                </Button>
              </div>
            </div>
          )}

          {phase === "answer" && answer && (
            <div className="space-y-4">
              {text.trim() && <p className="text-sm text-[var(--muted-foreground)]">„{text.trim()}“</p>}
              <div className="space-y-2">
                <p className="font-semibold">{describeQuery(answer.query)}</p>
                {answer.hits.length === 0 ? (
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm">
                    Dazu habe ich im Kalender nichts gefunden.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {answer.hits.map((hit) => (
                      <li key={hit.key}>
                        <button
                          type="button"
                          onClick={() => showInCalendar(hit)}
                          title="Im Kalender anzeigen"
                          className="flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-left transition-colors hover:bg-[var(--accent)]"
                        >
                          <span className="mt-0.5 w-6 shrink-0 text-center text-lg leading-none">
                            {hit.emoji ?? <CalendarClock className="mx-auto h-5 w-5 text-[var(--muted-foreground)]" />}
                          </span>
                          <span className="min-w-0 space-y-0.5">
                            <span className="block font-medium">
                              {hit.title}
                              {hit.anniversaryKind && hit.count !== null && (
                                <span className="font-normal text-[var(--muted-foreground)]">
                                  {" "}
                                  – {ANNIVERSARY_KINDS[hit.anniversaryKind].countLabel(hit.count)}
                                </span>
                              )}
                            </span>
                            <span className="block text-sm text-[var(--muted-foreground)]">{describeHit(hit)}</span>
                            {(hit.allFamily || hit.people.length > 0) && !hit.anniversaryKind && (
                              <span className="block text-xs text-[var(--muted-foreground)]">
                                {hit.allFamily ? "Alle" : hit.people.join(", ")}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    synth.cancel();
                    setPhase("input");
                  }}
                >
                  Frage ändern
                </Button>
                <Button
                  type="button"
                  className="ml-auto"
                  onClick={() => {
                    synth.cancel();
                    setText("");
                    setAnswer(null);
                    setPhase("input");
                  }}
                >
                  Neue Eingabe
                </Button>
              </div>
            </div>
          )}

          {(phase === "preview" || phase === "saving") && appt && start && end && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                <p className="text-base font-semibold">{appt.title}</p>
                <p className="flex items-start gap-2 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                  <span>
                    {start.toLocaleDateString("de-DE", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    <br />
                    {appt.is_all_day ? "Ganztägig" : `${formatTime(start)} – ${formatTime(end)} Uhr`}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                  {preview?.extracted.person ?? "Alle"}
                </p>
                {appt.notes && <p className="text-sm text-[var(--muted-foreground)]">{appt.notes}</p>}
              </div>
              {preview?.warnings.map((w) => (
                <p key={w} className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm">
                  {w}
                </p>
              ))}
              {error && (
                <p className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setPhase("input")} disabled={phase === "saving"}>
                  Ändern
                </Button>
                <Button type="button" className="ml-auto" onClick={save} disabled={phase === "saving"}>
                  {phase === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
