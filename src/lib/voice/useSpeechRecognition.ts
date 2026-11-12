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

export function useSpeechRecognition(lang = "de-DE") {
  // Auf dem Server false, im Browser die echte Prüfung — ohne Hydration-Abweichung.
  const supported = useSyncExternalStore(subscribeNever, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  /** Startet die Aufnahme; `onText` bekommt laufend den bisher erkannten Gesamttext. */
  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = getCtor();
      if (!Ctor) return;
      recognitionRef.current?.abort();

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        onText(text.trim());
      };
      recognition.onerror = (e) => {
        // "no-speech" und "aborted" sind keine Fehler, die man anzeigen müsste.
        if (e.error === "no-speech" || e.error === "aborted") return;
        setError(ERROR_MESSAGES[e.error] ?? "Die Spracherkennung ist fehlgeschlagen.");
      };
      // Eine abgelöste Aufnahme endet später; sie darf die neue nicht als beendet melden.
      recognition.onend = () => {
        if (recognitionRef.current === recognition) setListening(false);
      };

      recognitionRef.current = recognition;
      setError(null);
      try {
        recognition.start();
        setListening(true);
      } catch {
        setError("Die Spracherkennung konnte nicht gestartet werden.");
      }
    },
    [lang]
  );

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const abort = useCallback(() => {
    recognitionRef.current?.abort();
    setListening(false);
  }, []);

  /** Fehlermeldung ausblenden, z. B. sobald getippt wird. */
  const clearError = useCallback(() => setError(null), []);

  return { supported, listening, error, start, stop, abort, clearError };
}
