/* global React */
const { useState, useMemo } = React;

// ---------- helpers ----------
const todayISO = () => new Date().toISOString().slice(0,10);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const daysAgo = (n) => daysFromNow(-n);
const fmtDate = (iso, opts={ month:'short', day:'numeric'}) => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
};
const fmtFullDate = (iso) => fmtDate(iso, { month:'long', day:'numeric' });
const fmtWeekdayDate = (iso) => fmtDate(iso, { weekday:'long', month:'long', day:'numeric' });
const fmtRelative = (iso) => {
  const days = Math.round((new Date(iso) - new Date()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0 && days < 7) return `in ${days}d`;
  if (days < 0 && days > -7) return `${-days}d ago`;
  if (days < 0 && days > -30) return `${Math.round(-days/7)}w ago`;
  return fmtDate(iso);
};
const fmtTimeAgo = (iso) => {
  const min = Math.round((new Date() - new Date(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 60*24) return `${Math.round(min/60)}h ago`;
  return `${Math.round(min/60/24)}d ago`;
};
const uid = (() => { let n = 1000; return () => `id_${++n}`; })();

// ---------- tags ----------
const DEFAULT_TAGS = [
  { id: 't_life',    name: 'Life',     color: '#cc7c5e' },
  { id: 't_work',    name: 'Work',     color: '#5e8acc' },
  { id: 't_health',  name: 'Health',   color: '#5eaa83' },
  { id: 't_learn',   name: 'Learning', color: '#a06ec1' },
  { id: 't_money',   name: 'Money',    color: '#cca85e' },
];

// ---------- sample data ----------
// Long-term goals (3 types)
const SAMPLE_LONG = [
  {
    id: 'lt_weight',
    type: 'trend',
    name: 'Body weight',
    description: 'Slow recomp toward race weight.',
    unit: 'lb',
    direction: 'down',
    startDate: daysAgo(60),
    targetDate: daysFromNow(90),
    startValue: 178,
    targetValue: 162,
    tags: ['t_health', 't_life'],
    relatedGoalIds: ['lt_marathon', 'dg_run', 'dg_water'],
    logs: [
      { id: uid(), at: daysAgo(60)+'T08:01', value: 178.2, note: 'starting weigh-in' },
      { id: uid(), at: daysAgo(54)+'T08:10', value: 177.4 },
      { id: uid(), at: daysAgo(48)+'T07:55', value: 176.6, note: 'post-vacation' },
      { id: uid(), at: daysAgo(41)+'T08:00', value: 175.9 },
      { id: uid(), at: daysAgo(35)+'T08:00', value: 174.8, note: 'first sub-175 in a year' },
      { id: uid(), at: daysAgo(28)+'T08:02', value: 174.2 },
      { id: uid(), at: daysAgo(22)+'T08:05', value: 173.7 },
      { id: uid(), at: daysAgo(16)+'T07:50', value: 173.0 },
      { id: uid(), at: daysAgo(11)+'T08:00', value: 172.5, note: 'feels easy this week' },
      { id: uid(), at: daysAgo(7)+'T07:58',  value: 172.1 },
      { id: uid(), at: daysAgo(3)+'T08:01',  value: 171.4, note: 'long run yesterday' },
      { id: uid(), at: daysAgo(0)+'T08:00',  value: 171.0 },
    ],
  },
  {
    id: 'lt_books',
    type: 'accumulation',
    name: 'Read 30 books',
    description: '2026 reading challenge — fiction and non-fiction.',
    unit: 'books',
    targetTotal: 30,
    startDate: daysAgo(126),
    targetDate: daysFromNow(239),
    tags: ['t_learn', 't_life'],
    relatedGoalIds: ['dg_read', 'lt_weight'],
    logs: [
      { id: uid(), at: daysAgo(120)+'T20:00', value: 1, note: 'The Overstory — slow start, gorgeous prose' },
      { id: uid(), at: daysAgo(108)+'T21:14', value: 1, note: 'Project Hail Mary' },
      { id: uid(), at: daysAgo(96)+'T19:30',  value: 1, note: 'A Gentleman in Moscow' },
      { id: uid(), at: daysAgo(82)+'T22:00',  value: 1, note: 'Klara and the Sun' },
      { id: uid(), at: daysAgo(75)+'T20:45',  value: 1 },
      { id: uid(), at: daysAgo(68)+'T18:00',  value: 1, note: 'How to Take Smart Notes' },
      { id: uid(), at: daysAgo(58)+'T20:30',  value: 1, note: 'Piranesi — short, dreamy' },
      { id: uid(), at: daysAgo(49)+'T21:00',  value: 1 },
      { id: uid(), at: daysAgo(41)+'T20:15',  value: 1, note: 'Stoner' },
      { id: uid(), at: daysAgo(33)+'T19:45',  value: 1 },
      { id: uid(), at: daysAgo(22)+'T20:30',  value: 1, note: 'The Power Broker — finally' },
      { id: uid(), at: daysAgo(14)+'T22:10',  value: 1 },
      { id: uid(), at: daysAgo(6)+'T20:50',   value: 1, note: 'Tomorrow, and Tomorrow, and Tomorrow' },
    ],
  },
  {
    id: 'lt_launch',
    type: 'milestone',
    name: 'Launch prime. v1 to public',
    description: 'Ship the personal life management desktop app.',
    targetDate: daysFromNow(45),
    tags: ['t_work'],
    relatedGoalIds: ['dg_focus', 'lt_books'],
    milestones: [
      { id: 'm1', name: 'Goals feature spec done', dueDate: daysAgo(10), done: true,  doneAt: daysAgo(8)+'T15:30' },
      { id: 'm2', name: 'Goals UI built',          dueDate: daysFromNow(2), done: true,  doneAt: daysAgo(1)+'T18:10' },
      { id: 'm3', name: 'Migration script + sync', dueDate: daysFromNow(8), done: false },
      { id: 'm4', name: 'Beta with 10 testers',    dueDate: daysFromNow(18), done: false },
      { id: 'm5', name: 'Landing page live',       dueDate: daysFromNow(28), done: false },
      { id: 'm6', name: 'Public launch',           dueDate: daysFromNow(45), done: false },
    ],
    logs: [
      { id: uid(), at: daysAgo(8)+'T15:32',  note: 'Spec finalized — 3 long-term goal types + linkage rules' },
      { id: uid(), at: daysAgo(1)+'T18:14',  note: 'UI built — trend chart with pace line is the centerpiece' },
    ],
  },
  {
    id: 'lt_marathon',
    type: 'trend',
    name: 'Half marathon time',
    unit: 'min',
    direction: 'down',
    startDate: daysAgo(40),
    targetDate: daysFromNow(60),
    startValue: 118,
    targetValue: 99,
    tags: ['t_health'],
    relatedGoalIds: ['lt_weight', 'dg_run'],
    logs: [
      { id: uid(), at: daysAgo(40)+'T07:00', value: 118, note: 'baseline tempo run' },
      { id: uid(), at: daysAgo(28)+'T07:10', value: 114 },
      { id: uid(), at: daysAgo(14)+'T07:05', value: 109, note: 'felt strong' },
      { id: uid(), at: daysAgo(2)+'T07:00',  value: 106.5 },
    ],
  },
  {
    id: 'lt_savings',
    type: 'accumulation',
    name: 'Emergency fund',
    description: '6 months of expenses.',
    unit: '$',
    targetTotal: 18000,
    startDate: daysAgo(150),
    targetDate: daysFromNow(180),
    tags: ['t_money', 't_life'],
    relatedGoalIds: [],
    logs: [
      { id: uid(), at: daysAgo(140)+'T09:00', value: 1500, note: 'Starting balance moved over' },
      { id: uid(), at: daysAgo(110)+'T09:00', value: 1200 },
      { id: uid(), at: daysAgo(80)+'T09:00',  value: 1500 },
      { id: uid(), at: daysAgo(50)+'T09:00',  value: 2000, note: 'Bonus' },
      { id: uid(), at: daysAgo(20)+'T09:00',  value: 1300 },
    ],
  },
];

// Daily/weekly goals (recurring, like habits but goals-flavored)
const SAMPLE_DAILY = [
  { id: 'dg_run',    name: 'Run',                kind: 'check',  schedule: 'daily',     timeOfDay: 'morning', tags:['t_health'], linkedTo: 'lt_marathon', notes:'30+ min, easy pace if Z2 day.' },
  { id: 'dg_water',  name: 'Drink water',        kind: 'count',  target: 8, unit:'glasses', schedule: 'daily', timeOfDay: 'anytime', tags:['t_health'], linkedTo: 'lt_weight' },
  { id: 'dg_read',   name: 'Read 20 pages',      kind: 'check',  schedule: 'daily',     timeOfDay: 'evening', tags:['t_learn'], linkedTo: 'lt_books' },
  { id: 'dg_focus',  name: 'Deep work block',    kind: 'count',  target: 3, unit:'blocks', schedule: 'weekdays', timeOfDay: 'morning', tags:['t_work'], linkedTo: 'lt_launch', notes:'90-min Pomodoro-style; phone in box.' },
  { id: 'dg_med',    name: 'Meditate',           kind: 'check',  schedule: 'daily',     timeOfDay: 'morning', tags:['t_life'] },
  { id: 'dg_call',   name: 'Call parents',       kind: 'check',  schedule: 'weekly',    timeOfDay: 'anytime', tags:['t_life'] },
  { id: 'dg_journ',  name: 'Journal entry',      kind: 'check',  schedule: 'daily',     timeOfDay: 'evening', tags:['t_life'] },
];

// Today entries (which dailies are checked off so far)
const SAMPLE_TODAY_ENTRIES = {
  dg_run:   { done: true,  loggedAt: todayISO()+'T07:42' },
  dg_water: { count: 5,    loggedAt: todayISO()+'T14:10' },
  dg_med:   { done: true,  loggedAt: todayISO()+'T08:05' },
  dg_focus: { count: 2,    loggedAt: todayISO()+'T13:30' },
  // dg_read: not done
  // dg_call: not done
  // dg_journ: not done
};

// 7-day history flags for week-strip — naive
const SAMPLE_WEEK_HIST = {
  dg_run:   ['done','done','partial','done','done','done','done'],
  dg_water: ['done','partial','done','done','partial','done','partial'],
  dg_read:  ['done','done','done','partial','done','idle','idle'],
  dg_focus: ['done','done','idle','done','idle','idle','partial'],
  dg_med:   ['done','done','done','done','done','done','done'],
  dg_call:  ['idle','idle','idle','idle','idle','idle','idle'],
  dg_journ: ['done','done','idle','done','done','idle','idle'],
};

// Streaks
const SAMPLE_STREAKS = {
  dg_run: 14, dg_water: 3, dg_read: 9, dg_focus: 6, dg_med: 22, dg_call: 0, dg_journ: 4,
};

// ---------- store hook ----------
function useGoalsStore() {
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [longGoals, setLongGoals] = useState(SAMPLE_LONG);
  const [dailyGoals, setDailyGoals] = useState(SAMPLE_DAILY);
  const [todayEntries, setTodayEntries] = useState(SAMPLE_TODAY_ENTRIES);
  const [weekHist] = useState(SAMPLE_WEEK_HIST);
  const [streaks, setStreaks] = useState(SAMPLE_STREAKS);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const tagById = (id) => tags.find(t => t.id === id);
  const goalById = (id) => longGoals.find(g => g.id === id) || dailyGoals.find(g => g.id === id);

  // toggle daily check
  const toggleDailyCheck = (gid) => {
    setTodayEntries(prev => {
      const cur = prev[gid] || {};
      const isOn = cur.done === true;
      const next = { ...prev, [gid]: { done: !isOn, loggedAt: new Date().toISOString() } };
      return next;
    });
    setStreaks(prev => ({ ...prev, [gid]: (prev[gid] ?? 0) + 1 }));
  };

  const setDailyCount = (gid, n) => {
    setTodayEntries(prev => ({ ...prev, [gid]: { count: Math.max(0, n), loggedAt: new Date().toISOString() } }));
  };

  // log to a long-term goal
  const addLog = (goalId, log) => {
    setLongGoals(prev => prev.map(g => g.id === goalId
      ? { ...g, logs: [...(g.logs||[]), { id: uid(), at: new Date().toISOString(), ...log }] }
      : g));
    showToast('Log entry added.');
  };

  const toggleMilestone = (goalId, msId) => {
    setLongGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      return {
        ...g,
        milestones: g.milestones.map(m => m.id === msId
          ? { ...m, done: !m.done, doneAt: !m.done ? new Date().toISOString() : null }
          : m),
      };
    }));
  };

  const addLongGoal = (g) => {
    const id = uid();
    setLongGoals(prev => [{ ...g, id, logs: g.logs||[], milestones: g.milestones||[] }, ...prev]);
    showToast('Long-term goal created.');
    return id;
  };
  const addDailyGoal = (g) => {
    const id = uid();
    setDailyGoals(prev => [{ ...g, id }, ...prev]);
    showToast('Daily goal created.');
    return id;
  };

  const addTag = (name, color) => {
    const id = uid();
    setTags(prev => [...prev, { id, name, color }]);
    return id;
  };

  return {
    tags, tagById, addTag,
    longGoals, dailyGoals, goalById,
    todayEntries, weekHist, streaks,
    toggleDailyCheck, setDailyCount,
    addLog, toggleMilestone,
    addLongGoal, addDailyGoal,
    toast, showToast,
  };
}

// ---------- computed metrics ----------
function trendStats(goal) {
  const { logs = [], startValue, targetValue, startDate, targetDate, direction = 'down' } = goal;
  const sorted = [...logs].sort((a,b)=> new Date(a.at)-new Date(b.at));
  const last = sorted[sorted.length-1]?.value ?? startValue;
  const first = sorted[0]?.value ?? startValue;
  const totalDelta = targetValue - startValue;
  const progressDelta = last - startValue;
  const pct = totalDelta === 0 ? 0 : Math.max(0, Math.min(100, (progressDelta/totalDelta)*100));
  const days = Math.round((new Date(targetDate) - new Date(startDate)) / 86400000);
  const daysIn = Math.round((new Date() - new Date(startDate)) / 86400000);
  const expected = startValue + (totalDelta * Math.min(1, daysIn/days));
  const onPace = direction === 'down' ? last <= expected : last >= expected;
  const aheadBy = Math.abs(last - expected);
  return { last, first, totalDelta, progressDelta, pct, days, daysIn, expected, onPace, aheadBy };
}

function accumulationStats(goal) {
  const total = (goal.logs||[]).reduce((s,l)=>s+(l.value||0),0);
  const pct = Math.min(100, (total / goal.targetTotal)*100);
  const remaining = Math.max(0, goal.targetTotal - total);
  const days = Math.round((new Date(goal.targetDate) - new Date(goal.startDate)) / 86400000);
  const daysIn = Math.max(1, Math.round((new Date() - new Date(goal.startDate)) / 86400000));
  const daysLeft = Math.max(0, Math.round((new Date(goal.targetDate) - new Date()) / 86400000));
  const pacePerDay = goal.targetTotal / days;
  const expected = pacePerDay * daysIn;
  const onPace = total >= expected;
  return { total, pct, remaining, days, daysIn, daysLeft, expected, onPace, pacePerDay };
}

function milestoneStats(goal) {
  const ms = goal.milestones || [];
  const done = ms.filter(m=>m.done).length;
  const total = ms.length;
  const pct = total ? (done/total)*100 : 0;
  const next = ms.find(m => !m.done);
  return { done, total, pct, next };
}

window.GoalsData = {
  useGoalsStore, todayISO, daysFromNow, daysAgo,
  fmtDate, fmtFullDate, fmtWeekdayDate, fmtRelative, fmtTimeAgo,
  trendStats, accumulationStats, milestoneStats,
  DEFAULT_TAGS,
};
