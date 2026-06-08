import { describe, expect, it } from 'vitest';
import { endOfDay } from 'date-fns';
import {
  computeHoursPerDaySeconds,
  computeTimeRemainingOutcome,
  formatCompactHoursMinutes,
  formatHMS,
  formatMS,
  formatTimeRemaining,
  formatTimer,
  parseHMS,
  parseTimecode,
} from './time';

describe('parseTimecode', () => {
  it('parses hh:mm:ss', () => {
    expect(parseTimecode('00:05:00')).toBe(300);
    expect(parseTimecode('01:00:00')).toBe(3600);
    expect(parseTimecode('10:00:30')).toBe(36030);
  });

  it('ignores trailing :ff frames', () => {
    expect(parseTimecode('00:05:00:12')).toBe(300);
    expect(parseTimecode('01:23:45:29')).toBe(1 * 3600 + 23 * 60 + 45);
  });

  it('rejects garbage', () => {
    expect(parseTimecode('hello')).toBeNull();
    expect(parseTimecode('5:00')).toBeNull();
    expect(parseTimecode('00:60:00')).toBeNull();
    expect(parseTimecode('')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseTimecode('  00:05:00  ')).toBe(300);
  });
});

describe('parseHMS (strict)', () => {
  it('rejects frame counts', () => {
    expect(parseHMS('00:05:00:12')).toBeNull();
  });
  it('accepts hh:mm:ss', () => {
    expect(parseHMS('00:05:00')).toBe(300);
  });
});

describe('formatHMS', () => {
  it('formats positive', () => {
    expect(formatHMS(0)).toBe('00:00:00');
    expect(formatHMS(300)).toBe('00:05:00');
    expect(formatHMS(3661)).toBe('01:01:01');
  });
  it('formats negative with leading minus', () => {
    expect(formatHMS(-1)).toBe('-00:00:01');
    expect(formatHMS(-(2 * 3600 + 14 * 60 + 33))).toBe('-02:14:33');
  });
});

describe('computeHoursPerDaySeconds', () => {
  it('computes 24h / buffer rounded up to 15 minutes', () => {
    expect(computeHoursPerDaySeconds(6)).toBe(4 * 3600);
    expect(computeHoursPerDaySeconds(5)).toBe(5 * 3600);
    expect(computeHoursPerDaySeconds(8)).toBe(3 * 3600);
  });

  it('returns null for invalid buffer', () => {
    expect(computeHoursPerDaySeconds(0)).toBeNull();
    expect(computeHoursPerDaySeconds(-1)).toBeNull();
  });
});

describe('formatCompactHoursMinutes', () => {
  it('formats as xhym', () => {
    expect(formatCompactHoursMinutes(4 * 3600)).toBe('4h0m');
    expect(formatCompactHoursMinutes(3 * 3600 + 15 * 60)).toBe('3h15m');
  });
});

describe('computeTimeRemainingOutcome', () => {
  const now = new Date('2026-06-08T12:00:00');

  it('returns future when pace ends tomorrow or later', () => {
    expect(
      computeTimeRemainingOutcome(
        new Date('2026-06-09T10:00:00'),
        6,
        now,
      ).status,
    ).toBe('future');
    expect(formatTimeRemaining({ status: 'future' })).toBe('---');
  });

  it('uses end of today minus pace end, divided by buffer', () => {
    const paceEnd = new Date('2026-06-08T18:00:00');
    const outcome = computeTimeRemainingOutcome(paceEnd, 6, now);
    const expectedSeconds =
      (endOfDay(now).getTime() - paceEnd.getTime()) / 1000 / 6;
    expect(outcome).toEqual({ status: 'value', seconds: expectedSeconds });
    expect(formatTimeRemaining(outcome)).toBe(
      formatCompactHoursMinutes(expectedSeconds),
    );
  });

  it('uses end of today when pace ended yesterday or earlier', () => {
    const paceEnd = new Date('2026-06-07T15:00:00');
    const outcome = computeTimeRemainingOutcome(paceEnd, 2, now);
    const expectedSeconds =
      (endOfDay(now).getTime() - paceEnd.getTime()) / 1000 / 2;
    expect(outcome).toEqual({ status: 'value', seconds: expectedSeconds });
  });
});

describe('formatMS / formatTimer', () => {
  it('mm:ss under an hour', () => {
    expect(formatMS(0)).toBe('00:00');
    expect(formatMS(125)).toBe('02:05');
    expect(formatTimer(125)).toBe('02:05');
  });
  it('hh:mm:ss at/over an hour', () => {
    expect(formatTimer(3600)).toBe('01:00:00');
  });
  it('signed timer overflow', () => {
    expect(formatTimer(-65)).toBe('-01:05');
  });
});
