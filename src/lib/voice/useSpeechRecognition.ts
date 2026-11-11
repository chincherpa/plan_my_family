"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Spracherkennung im Browser (Web Speech API). Verfügbar in Chrome, Edge und
 * Safari; Firefox hat sie nicht — dort ist `supported` false und die Oberfläche
 * bietet nur das Textfeld an.
 */

// Die Typen fehlen in lib.dom, deshalb hier nur das, was wir brauchen.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Der Zugriff auf das Mikrofon wurde nicht erlaubt.",
  "service-not-allowed": "Der Zugriff auf das Mikrofon wurde nicht erlaubt.",
  "audio-capture": "Es wurde kein Mikrofon gefunden.",
  network: "Die Spracherkennung braucht eine Internetverbindung.",
  "language-not-supported": "Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt.",
};

const subscribeNever = () => () => {};

/**
 * So lange darf es still sein, bevor die Aufnahme von selbst endet. Der Browser
 * würde schon nach ein bis zwei Sekunden Pause abbrechen; wir halten die
 * Aufnahme dagegen offen (Dauer-Modus, bei Abbruch Neustart) und beenden sie erst
 * nach dieser Stille — oder sofort per „Stopp“.
 */
export const SILENCE_TIMEOUT_MS = 6000;

const joinText = (a: string, b: string) => [a, b].filter(Boolean).join(" ");

export function useSpeechRecognition(lang = "de-DE") {
  // Auf dem Server false, im Browser die echte Prüfung — ohne Hydration-Abweichung.
  const supported = useSyncExternalStore(subscribeNever, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  /** true, solange die Aufnahme weiterlaufen soll (Browser-Abbrüche werden dann neu gestartet). */
  const wantRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearSilenceTimer = useCallback(() => clearTimeout(silenceTimerRef.current), []);

  useEffect(
    () => () => {
      wantRef.current = false;
      clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.abort();
    },
    []
  );

  /** Startet die Aufnahme; `onText` bekommt laufend den bisher erkannten Gesamttext. */
  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = getCtor();
      if (!Ctor) return;
      wantRef.current = false;
      recognitionRef.current?.abort();

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      // Was frühere Aufnahme-Runden (nach einem Browser-Abbruch) schon erkannt haben,
      // und was die laufende Runde bisher hat.
      let committed = "";
      let current = "";

      const finish = () => {
        wantRef.current = false;
        clearTimeout(silenceTimerRef.current);
        setListening(false);
      };
      const armSilenceTimer = () => {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          wantRef.current = false;
          recognition.stop();
        }, SILENCE_TIMEOUT_MS);
      };

      recognition.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        current = text.trim();
        onText(joinText(committed, current));
        armSilenceTimer();
      };
      recognition.onerror = (e) => {
        // "no-speech" und "aborted" kommen bei Pausen vor und sind keine Fehler.
        if (e.error === "no-speech" || e.error === "aborted") return;
        setError(ERROR_MESSAGES[e.error] ?? "Die Spracherkennung ist fehlgeschlagen.");
        finish();
      };
      recognition.onend = () => {
        if (!wantRef.current) {
          finish();
          return;
        }
        // Der Browser hat von sich aus beendet (Pause, Zeitlimit): weiter zuhören.
        committed = joinText(committed, current);
        current = "";
        try {
          recognition.start();
        } catch {
          finish();
        }
      };

      recognitionRef.current = recognition;
      setError(null);
      try {
        recognition.start();
        wantRef.current = true;
        setListening(true);
        armSilenceTimer();
      } catch {
        setError("Die Spracherkennung konnte nicht gestartet werden.");
      }
    },
    [lang]
  );

  const stop = useCallback(() => {
    wantRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  const abort = useCallback(() => {
    wantRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.abort();
    setListening(false);
  }, [clearSilenceTimer]);

  return { supported, listening, error, start, stop, abort };
}
