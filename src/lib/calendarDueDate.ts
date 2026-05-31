export type DueDateDropTarget =
  | { type: 'undated' }
  | { type: 'day'; dayKey: string };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function localDayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return localDayKeyFromDate(date);
}

function parseDayKey(dayKey: string): { year: number; monthIndex: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    throw new Error('Invalid day key.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Invalid day key.');
  }

  const monthIndex = month - 1;
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    throw new Error('Invalid day key.');
  }

  return { year, monthIndex, day };
}

export function dueDateForDropTarget(target: DueDateDropTarget): string | null {
  if (target.type === 'undated') return null;
  const { year, monthIndex, day } = parseDayKey(target.dayKey);
  // Persist local wall-clock 11 PM on the dropped day.
  const localDate = new Date(year, monthIndex, day, 23, 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) {
    throw new Error('Invalid drop date.');
  }
  return localDate.toISOString();
}

export function startDateForDropDay(dayKey: string): string {
  const { year, monthIndex, day } = parseDayKey(dayKey);
  // Persist local wall-clock 5 AM on the dropped day.
  const localDate = new Date(year, monthIndex, day, 5, 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) {
    throw new Error('Invalid drop date.');
  }
  return localDate.toISOString();
}
