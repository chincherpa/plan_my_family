"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Vorlesen im Browser (Speech Synthesis API) — verfügbar in Chrome, Edge, Safari und Firefox. */

const subscribeNever = () => () => {};
const isSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function useSpeechSynthesis(lang = "de-DE") {
  const supported = useSyncExternalStore(subscribeNever, isSupported, () => false);

  const cancel = useCallback(() => {
    if (isSupported()) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported() || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      // Eine deutsche Stimme bevorzugen, sonst wählt der Browser nach `lang`.
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    },
    [lang]
  );

  // Beim Schließen des Dialogs nicht weiterreden.
  useEffect(() => cancel, [cancel]);

  return { supported, speak, cancel };
}
