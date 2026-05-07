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
