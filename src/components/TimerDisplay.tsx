import { formatTimer } from '../lib/time';
import { parseHMS } from '../lib/time';
import { useState, useEffect } from 'react';

interface Props {
  durationSeconds: number;
  remaining: number;
  running: boolean;
  overflowed: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onChangeDuration: (seconds: number) => void;
}

export default function TimerDisplay({
  durationSeconds,
  remaining,
  running,
  overflowed,
  onStart,
  onPause,
  onReset,
  onChangeDuration,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toMinSec(durationSeconds));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(toMinSec(durationSeconds));
  }, [durationSeconds, editing]);

  const commit = () => {
    const seconds = parseMinSec(draft);
    if (seconds == null) {
      setError('Use mm:ss or hh:mm:ss.');
      return;
    }
    setError(null);
    onChangeDuration(seconds);
    setEditing(false);
  };

  const pct =
    durationSeconds > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((durationSeconds - Math.max(0, remaining)) / durationSeconds) * 100,
          ),
        )
      : 0;

  return (
    <div
      className={`card relative overflow-hidden flex flex-col items-center gap-5 py-10 ${
        overflowed ? 'ring-1 ring-danger/40' : ''
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{
          background: overflowed
            ? 'radial-gradient(60% 70% at 50% 0%, rgb(var(--danger) / 0.28), transparent 75%)'
            : running
              ? 'radial-gradient(60% 70% at 50% 0%, rgb(var(--accent) / 0.22), transparent 75%)'
              : 'radial-gradient(60% 70% at 50% 0%, rgb(var(--accent) / 0.10), transparent 75%)',
        }}
        aria-hidden
      />

      <div className="relative">
        <div
          className={`font-sans text-7xl font-semibold tabular-nums tracking-tight transition-colors sm:text-8xl ${
            overflowed ? 'text-danger' : 'text-fg'
          }`}
          aria-live="polite"
          style={
            overflowed
              ? { textShadow: '0 0 32px rgb(var(--danger) / 0.45)' }
              : undefined
          }
        >
          {overflowed
            ? `−${formatTimer(Math.abs(remaining))}`
            : formatTimer(Math.max(0, remaining))}
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="progress-track h-1.5">
          <div
            className={`progress-fill ${overflowed ? '' : ''}`}
            style={{
              width: `${pct}%`,
              backgroundImage: overflowed
                ? 'linear-gradient(90deg, rgb(var(--danger) / 0.85), rgb(var(--danger)))'
                : undefined,
            }}
            aria-hidden
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {running ? (
          <button onClick={onPause} className="btn-secondary">
            <PauseGlyph /> Pause
          </button>
        ) : (
          <button onClick={onStart} className="btn-primary">
            <PlayGlyph />
            {remaining < durationSeconds && remaining !== 0 ? 'Resume' : 'Start'}
          </button>
        )}
        <button onClick={onReset} className="btn-ghost">
          Reset
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="label">Duration</span>
        {editing ? (
          <>
            <input
              autoFocus
              className="input w-28 font-sans tabular-nums !py-1.5"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commit}
              placeholder="10:00"
            />
            {error ? <span className="text-danger">{error}</span> : null}
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="font-sans tabular-nums text-fg/90 underline-offset-4 hover:underline disabled:no-underline disabled:opacity-60"
            disabled={running}
            title={running ? 'Pause to change duration' : 'Click to edit'}
          >
            {toMinSec(durationSeconds)}
          </button>
        )}
      </div>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function toMinSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseMinSec(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d{1,4}:[0-5]?\d:[0-5]?\d$/.test(trimmed)) {
    return parseHMS(trimmed);
  }
  const m = trimmed.match(/^(\d{1,4}):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 60;
  return null;
}
