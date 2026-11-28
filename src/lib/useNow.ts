"use client";
import { useEffect, useState } from "react";

function currentMinute(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
}

/**
 * Current time floored to the minute, refreshed on each full minute (moves the
 * now-line, rolls over at midnight). Flooring keeps the SSR and hydration
 * renders identical within the same minute.
 */
export function useNow(): Date {
  const [now, setNow] = useState(currentMinute);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(currentMinute());
      id = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  return now;
}
