import { addDays, endOfDay, startOfDay } from 'date-fns';

/**
 * Parse a timestamp string in `hh:mm:ss` or `hh:mm:ss:ff` form into seconds.
 * The optional `:ff` (Premiere Pro frame count) is intentionally ignored per SPEC.
 * Returns null if the input doesn't match.
 */
export function parseTimecode(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(\d{1,4}):([0-5]?\d):([0-5]?\d)(?::(\d{1,3}))?$/,
  );
  if (!match) return null;
  const [, hh, mm, ss] = match;
  const h = Number(hh);
  const m = Number(mm);
  const s = Number(ss);
  if ([h, m, s].some((n) => Number.isNaN(n))) return null;
  return h * 3600 + m * 60 + s;
}

/**
 * Parse a strict `hh:mm:ss` (no frames). Used for inputs that should not accept frame counts.
 */
export function parseHMS(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (!/^\d{1,4}:[0-5]?\d:[0-5]?\d$/.test(trimmed)) return null;
  return parseTimecode(trimmed);
}

/**
 * Parse `hh:mm:ss` with an optional `:ff` frame suffix.
 * Frame counts are ignored and only whole-second progress is returned.
 */
export function parseHMSWithOptionalFrames(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (!/^\d{1,4}:[0-5]?\d:[0-5]?\d(?::\d{1,3})?$/.test(trimmed)) return null;
  return parseTimecode(trimmed);
}

/**
 * Format seconds as `hh:mm:ss`. Negative values produce a leading minus sign.
 * Always returns at least 2-digit hours.
 */
export function formatHMS(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '--:--:--';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.floor(Math.abs(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${sign}${hh}:${mm}:${ss}`;
}

/**
 * Format seconds as `mm:ss` (used for the timer display below an hour).
 */
export function formatMS(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '--:--';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.floor(Math.abs(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Pretty-print seconds for the timer (mm:ss under an hour, hh:mm:ss above).
 */
export function formatTimer(totalSeconds: number): string {
  return Math.abs(totalSeconds) >= 3600
    ? formatHMS(totalSeconds)
    : formatMS(totalSeconds);
}

const FIFTEEN_MINUTES_SECONDS = 15 * 60;
const TWENTY_FOUR_HOURS_SECONDS = 24 * 3600;

/**
 * Hours per day from buffer modifier: 24h / buffer, rounded up to the nearest 15 minutes.
 */
export function computeHoursPerDaySeconds(bufferModifier: number): number | null {
  if (!Number.isFinite(bufferModifier) || bufferModifier <= 0) return null;
  const rawSeconds = TWENTY_FOUR_HOURS_SECONDS / bufferModifier;
  return (
    Math.ceil(rawSeconds / FIFTEEN_MINUTES_SECONDS) * FIFTEEN_MINUTES_SECONDS
  );
}

/**
 * Format seconds as compact `xhym` (e.g. `4h0m`, `3h15m`).
 */
export function formatCompactHoursMinutes(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '—';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.floor(Math.abs(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  return `${sign}${hours}h${minutes}m`;
}

export type TimeRemainingOutcome =
  | { status: 'value'; seconds: number }
  | { status: 'future' }
  | { status: 'unavailable' };

/**
 * Time remaining until end of today from pace end, divided by buffer.
 * Pace end tomorrow or later yields `future`; missing inputs yield `unavailable`.
 */
export function computeTimeRemainingOutcome(
  paceEnd: Date | null,
  bufferModifier: number,
  now: Date,
): TimeRemainingOutcome {
  if (
    paceEnd == null ||
    !Number.isFinite(bufferModifier) ||
    bufferModifier <= 0
  ) {
    return { status: 'unavailable' };
  }

  const tomorrowStart = addDays(startOfDay(now), 1);
  if (paceEnd.getTime() >= tomorrowStart.getTime()) {
    return { status: 'future' };
  }

  const secondsUntilEndOfDay =
    (endOfDay(now).getTime() - paceEnd.getTime()) / 1000;
  if (secondsUntilEndOfDay <= 0) {
    return { status: 'value', seconds: 0 };
  }

  return {
    status: 'value',
    seconds: secondsUntilEndOfDay / bufferModifier,
  };
}

export function formatTimeRemaining(outcome: TimeRemainingOutcome): string {
  if (outcome.status === 'future') return '---';
  if (outcome.status === 'unavailable') return '—';
  return formatCompactHoursMinutes(outcome.seconds);
}

/**
 * Format decimal hours as `xh ym`, rounded to nearest minute.
 */
export function formatHoursMinutes(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  const totalMinutes = Math.round(hours * 60);
  const sign = totalMinutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(totalMinutes);
  const wholeHours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${wholeHours}h ${minutes}m`;
}
