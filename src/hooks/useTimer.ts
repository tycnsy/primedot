import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'prime.timer.duration_seconds';
const DEFAULT_DURATION = 10 * 60;

function readStoredDuration(): number {
  if (typeof window === 'undefined') return DEFAULT_DURATION;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const num = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(num) && num > 0 ? num : DEFAULT_DURATION;
}

interface UseTimerResult {
  durationSeconds: number;
  setDurationSeconds: (s: number) => void;
  /** Seconds remaining (positive) or elapsed past zero (negative). */
  remaining: number;
  running: boolean;
  /** True once `remaining` has dropped below zero (overflow phase). */
  overflowed: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /**
   * The wall-clock time at which the timer was started for the current run, or
   * null when it has never run / has been reset. Useful for snapshotting the
   * "estimated progress goal" exactly at the start of a session.
   */
  startedAt: Date | null;
}

/**
 * A simple timer hook.
 *
 * - Counts down from `durationSeconds`.
 * - When `remaining` hits 0, it continues counting *up* into negative numbers (UI
 *   converts that to a red, counting-up display per SPEC).
 * - `durationSeconds` is persisted to `localStorage` across sessions.
 */
export function useTimer(): UseTimerResult {
  const [durationSeconds, setDurationState] = useState<number>(() =>
    readStoredDuration(),
  );
  const [remaining, setRemaining] = useState<number>(() => readStoredDuration());
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(durationSeconds));
    }
  }, [durationSeconds]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => r - 1);
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [running]);

  const setDurationSeconds = (s: number) => {
    const next = Math.max(1, Math.floor(s));
    setDurationState(next);
    if (!running) setRemaining(next);
  };

  const start = () => {
    if (running) return;
    if (remaining === 0) setRemaining(durationSeconds);
    setStartedAt((prev) => prev ?? new Date());
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setRemaining(durationSeconds);
    setStartedAt(null);
  };

  return {
    durationSeconds,
    setDurationSeconds,
    remaining,
    running,
    overflowed: remaining < 0,
    start,
    pause,
    reset,
    startedAt,
  };
}
