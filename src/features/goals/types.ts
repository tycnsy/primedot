export type GoalType = 'trend' | 'accumulation' | 'milestone';
export type Schedule = 'daily' | 'weekly';
export type Kind = 'check' | 'count';
export type TimeOfDay = 'morning' | 'anytime' | 'evening';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface LogEntry {
  id: string;
  at: string;
  value?: number;
  note?: string;
  kind?: 'total' | 'adjustment';
  delta?: number;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
}

interface GoalBase {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  targetDate: string;
  tags: string[];
  relatedGoalIds: string[];
  archivedAt?: string | null;
}

export interface TrendGoal extends GoalBase {
  type: 'trend';
  startValue: number;
  targetValue: number;
  direction: 'up' | 'down';
  unit: string;
  logs: LogEntry[];
}

export interface AccumulationGoal extends GoalBase {
  type: 'accumulation';
  targetTotal: number;
  unit: string;
  logs: LogEntry[];
}

export interface MilestoneGoal extends GoalBase {
  type: 'milestone';
  milestones: Milestone[];
  logs: LogEntry[];
}

export type LongGoal = TrendGoal | AccumulationGoal | MilestoneGoal;

export interface DailyGoal {
  id: string;
  name: string;
  notes?: string;
  schedule: Schedule;
  kind: Kind;
  target?: number;
  unit?: string;
  timeOfDay?: TimeOfDay;
  tags: string[];
  linkedTo?: string;
  archivedAt?: string | null;
}

export type DayMark = 0 | 0.5 | 1;

export type DailyGoalWeekState = 'done' | 'partial' | 'idle';

export interface DailyGoalEntry {
  done?: boolean;
  count?: number;
  loggedAt: string;
}

export type DailyGoalEntries = Record<string, DailyGoalEntry>;
export type DailyGoalWeekHistory = Record<string, DailyGoalWeekState[]>;
export type DailyGoalStreaks = Record<string, number>;

export type NewTrendGoalInput = Omit<TrendGoal, 'id'>;
export type NewAccumulationGoalInput = Omit<AccumulationGoal, 'id'>;
export type NewMilestoneGoalInput = Omit<MilestoneGoal, 'id'>;
export type NewLongGoalInput =
  | NewTrendGoalInput
  | NewAccumulationGoalInput
  | NewMilestoneGoalInput;
export type NewDailyGoalInput = Omit<DailyGoal, 'id'>;
