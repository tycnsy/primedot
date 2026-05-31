import { describe, expect, it } from 'vitest';
import {
  dueDateForDropTarget,
  localDayKeyFromIso,
  startDateForDropDay,
} from './calendarDueDate';

describe('dueDateForDropTarget', () => {
  it('returns null for undated target', () => {
    expect(dueDateForDropTarget({ type: 'undated' })).toBeNull();
  });

  it('sets dropped day due date to local 11pm', () => {
    const iso = dueDateForDropTarget({ type: 'day', dayKey: '2026-05-22' });
    expect(iso).not.toBeNull();
    if (!iso) {
      throw new Error('Expected an ISO date for day drop target.');
    }

    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(22);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(0);
    expect(localDayKeyFromIso(iso)).toBe('2026-05-22');
  });

  it('preserves day key on DST-adjacent dates', () => {
    const iso = dueDateForDropTarget({ type: 'day', dayKey: '2026-11-01' });
    if (!iso) {
      throw new Error('Expected an ISO date for day drop target.');
    }
    expect(localDayKeyFromIso(iso)).toBe('2026-11-01');

    const date = new Date(iso);
    expect(date.getHours()).toBe(23);
  });
});

describe('startDateForDropDay', () => {
  it('sets dropped day start date to local 5am', () => {
    const iso = startDateForDropDay('2026-05-22');
    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(22);
    expect(date.getHours()).toBe(5);
    expect(date.getMinutes()).toBe(0);
    expect(localDayKeyFromIso(iso)).toBe('2026-05-22');
  });

  it('preserves day key on DST-adjacent dates', () => {
    const iso = startDateForDropDay('2026-11-01');
    expect(localDayKeyFromIso(iso)).toBe('2026-11-01');
    expect(new Date(iso).getHours()).toBe(5);
  });
});
