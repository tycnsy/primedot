import type {
  DailyGoal,
  DailyGoalEntries,
  DailyGoalStreaks,
  DailyGoalWeekHistory,
  LongGoal,
  Tag,
} from './types';

const MS_PER_DAY = 86_400_000;

function dayIso(daysOffset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setTime(date.getTime() + daysOffset * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

function atIso(daysOffset: number, time: string): string {
  return `${dayIso(daysOffset)}T${time}`;
}

let generatedId = 1000;
function uid(): string {
  generatedId += 1;
  return `id_${generatedId}`;
}

export const DEFAULT_GOAL_TAGS: Tag[] = [
  { id: 't_life', name: 'Life', color: '#cc7c5e' },
  { id: 't_work', name: 'Work', color: '#5e8acc' },
  { id: 't_health', name: 'Health', color: '#5eaa83' },
  { id: 't_learn', name: 'Learning', color: '#a06ec1' },
  { id: 't_money', name: 'Money', color: '#cca85e' },
];

export const DEFAULT_LONG_GOALS: LongGoal[] = [
  {
    id: 'lt_weight',
    type: 'trend',
    name: 'Body weight',
    description: 'Slow recomp toward race weight.',
    unit: 'lb',
    direction: 'down',
    startDate: dayIso(-60),
    targetDate: dayIso(90),
    startValue: 178,
    targetValue: 162,
    tags: ['t_health', 't_life'],
    relatedGoalIds: ['lt_marathon', 'dg_run', 'dg_water'],
    logs: [
      { id: uid(), at: atIso(-60, '08:01'), value: 178.2, note: 'starting weigh-in' },
      { id: uid(), at: atIso(-35, '08:00'), value: 174.8, note: 'first sub-175 in a year' },
      { id: uid(), at: atIso(-11, '08:00'), value: 172.5, note: 'feels easy this week' },
      { id: uid(), at: atIso(0, '08:00'), value: 171.0 },
    ],
  },
  {
    id: 'lt_books',
    type: 'accumulation',
    name: 'Read 30 books',
    description: '2026 reading challenge - fiction and non-fiction.',
    unit: 'books',
    targetTotal: 30,
    startDate: dayIso(-126),
    targetDate: dayIso(239),
    tags: ['t_learn', 't_life'],
    relatedGoalIds: ['dg_read', 'lt_weight'],
    logs: [
      { id: uid(), at: atIso(-120, '20:00'), value: 1, note: 'The Overstory' },
      { id: uid(), at: atIso(-82, '22:00'), value: 1, note: 'Klara and the Sun' },
      { id: uid(), at: atIso(-41, '20:15'), value: 1, note: 'Stoner' },
      { id: uid(), at: atIso(-6, '20:50'), value: 1, note: 'Tomorrow, and Tomorrow, and Tomorrow' },
    ],
  },
  {
    id: 'lt_launch',
    type: 'milestone',
    name: 'Launch prime. v1 to public',
    description: 'Ship the personal life management desktop app.',
    startDate: dayIso(-21),
    targetDate: dayIso(45),
    tags: ['t_work'],
    relatedGoalIds: ['dg_focus', 'lt_books'],
    milestones: [
      {
        id: 'm1',
        name: 'Goals feature spec done',
        dueDate: dayIso(-10),
        done: true,
        doneAt: atIso(-8, '15:30'),
      },
      {
        id: 'm2',
        name: 'Goals UI built',
        dueDate: dayIso(2),
        done: true,
        doneAt: atIso(-1, '18:10'),
      },
      { id: 'm3', name: 'Migration script + sync', dueDate: dayIso(8), done: false, doneAt: null },
      { id: 'm4', name: 'Beta with 10 testers', dueDate: dayIso(18), done: false, doneAt: null },
      { id: 'm5', name: 'Landing page live', dueDate: dayIso(28), done: false, doneAt: null },
      { id: 'm6', name: 'Public launch', dueDate: dayIso(45), done: false, doneAt: null },
    ],
    logs: [
      { id: uid(), at: atIso(-8, '15:32'), note: 'Spec finalized' },
      { id: uid(), at: atIso(-1, '18:14'), note: 'UI built with pace line' },
    ],
  },
];

export const DEFAULT_DAILY_GOALS: DailyGoal[] = [
  {
    id: 'dg_run',
    name: 'Run',
    kind: 'check',
    schedule: 'daily',
    timeOfDay: 'morning',
    tags: ['t_health'],
    linkedTo: 'lt_marathon',
    notes: '30+ min, easy pace if Z2 day.',
  },
  {
    id: 'dg_water',
    name: 'Drink water',
    kind: 'count',
    target: 8,
    unit: 'glasses',
    schedule: 'daily',
    timeOfDay: 'anytime',
    tags: ['t_health'],
    linkedTo: 'lt_weight',
  },
  {
    id: 'dg_read',
    name: 'Read 20 pages',
    kind: 'check',
    schedule: 'daily',
    timeOfDay: 'evening',
    tags: ['t_learn'],
    linkedTo: 'lt_books',
  },
  {
    id: 'dg_focus',
    name: 'Deep work block',
    kind: 'count',
    target: 3,
    unit: 'blocks',
    schedule: 'weekly',
    timeOfDay: 'morning',
    tags: ['t_work'],
    linkedTo: 'lt_launch',
    notes: '90-min Pomodoro style; phone in box.',
  },
  {
    id: 'dg_med',
    name: 'Meditate',
    kind: 'check',
    schedule: 'daily',
    timeOfDay: 'morning',
    tags: ['t_life'],
  },
  {
    id: 'dg_call',
    name: 'Call parents',
    kind: 'check',
    schedule: 'weekly',
    timeOfDay: 'anytime',
    tags: ['t_life'],
  },
];

export const DEFAULT_TODAY_ENTRIES: DailyGoalEntries = {
  dg_run: { done: true, loggedAt: atIso(0, '07:42') },
  dg_water: { count: 5, loggedAt: atIso(0, '14:10') },
  dg_med: { done: true, loggedAt: atIso(0, '08:05') },
  dg_focus: { count: 2, loggedAt: atIso(0, '13:30') },
};

export const DEFAULT_WEEK_HISTORY: DailyGoalWeekHistory = {
  dg_run: ['done', 'done', 'partial', 'done', 'done', 'done', 'done'],
  dg_water: ['done', 'partial', 'done', 'done', 'partial', 'done', 'partial'],
  dg_read: ['done', 'done', 'done', 'partial', 'done', 'idle', 'idle'],
  dg_focus: ['done', 'done', 'idle', 'done', 'idle', 'idle', 'partial'],
  dg_med: ['done', 'done', 'done', 'done', 'done', 'done', 'done'],
  dg_call: ['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle'],
};

export const DEFAULT_STREAKS: DailyGoalStreaks = {
  dg_run: 14,
  dg_water: 3,
  dg_read: 9,
  dg_focus: 6,
  dg_med: 22,
  dg_call: 0,
};
