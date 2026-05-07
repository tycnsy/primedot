import { describe, expect, it } from 'vitest';
import { formatHMS, formatMS, formatTimer, parseHMS, parseTimecode } from './time';

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
