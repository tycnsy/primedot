export type HabitKind = 'check' | 'count' | 'scale' | 'note';

export type HabitTimeOfDay = 'morning' | 'anytime' | 'evening' | null;

export type Schedule =
  | { type: 'daily' }
  | {
      type: 'weekdays';
      days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    }
  | { type: 'every-n-days'; count: number }
  | { type: 'times-per-day'; count: number };

export interface Habit {
  id: string;
  userId?: string;
  name: string;
  kind: HabitKind;
  schedule: Schedule;
  target?: number;
  unit?: string;
  scaleMax?: number;
  timeOfDay?: HabitTimeOfDay;
  order: number;
  createdAt?: string;
  archivedAt?: string | null;
  notes?: string;
  tags?: string[];
}

export interface HabitEntry {
  id?: string;
  habitId: string;
  userId?: string;
  date: string;
  done?: boolean;
  count?: number;
  scale?: number;
  noteText?: string;
  loggedAt?: string;
}

export type DayState = 'done' | 'partial' | 'skip' | 'idle' | 'future';

export type NewHabit = Omit<Habit, 'id' | 'order' | 'createdAt' | 'archivedAt'>;

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  thisMonth: { done: number; total: number };
  consistency: number;
  total: number;
}
