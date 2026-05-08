import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type {
  DailyGoal,
  DailyGoalEntries,
  DailyGoalStreaks,
  DailyGoalWeekHistory,
  LogEntry,
  LongGoal,
  NewDailyGoalInput,
  NewLongGoalInput,
  Tag,
} from './types';

type GoalTagRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

type GoalLongRow = {
  id: string;
  user_id: string;
  type: 'trend' | 'accumulation' | 'milestone';
  name: string;
  description: string | null;
  start_date: string;
  target_date: string;
  tags: string[];
  related_goal_ids: string[];
  archived_at: string | null;
  start_value: number | null;
  target_value: number | null;
  direction: 'up' | 'down' | null;
  unit: string | null;
  target_total: number | null;
  sort_order: number;
  created_at: string;
};

type GoalLongLogRow = {
  id: string;
  long_goal_id: string;
  user_id: string;
  at: string;
  value: number | null;
  note: string | null;
  created_at: string;
};

type GoalMilestoneRow = {
  id: string;
  long_goal_id: string;
  user_id: string;
  name: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  created_at: string;
};

type GoalDailyRow = {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  schedule: 'daily' | 'weekly';
  kind: 'check' | 'count';
  target: number | null;
  unit: string | null;
  time_of_day: 'morning' | 'anytime' | 'evening' | null;
  tags: string[];
  linked_to: string | null;
  archived_at: string | null;
  streak: number;
  created_at: string;
};

type GoalDailyEntryRow = {
  id: string;
  daily_goal_id: string;
  user_id: string;
  date: string;
  done: boolean | null;
  count: number | null;
  logged_at: string;
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function mapTag(row: GoalTagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function mapLog(row: GoalLongLogRow): LogEntry {
  return {
    id: row.id,
    at: row.at,
    value: row.value ?? undefined,
    note: row.note ?? undefined,
  };
}

function mapDaily(row: GoalDailyRow): DailyGoal {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes ?? undefined,
    schedule: row.schedule,
    kind: row.kind,
    target: row.target ?? undefined,
    unit: row.unit ?? undefined,
    timeOfDay: row.time_of_day ?? undefined,
    tags: row.tags ?? [],
    linkedTo: row.linked_to ?? undefined,
    archivedAt: row.archived_at,
  };
}

function mapLong(
  row: GoalLongRow,
  logsByGoal: Map<string, LogEntry[]>,
  milestonesByGoal: Map<string, GoalMilestoneRow[]>,
): LongGoal {
  const logs = logsByGoal.get(row.id) ?? [];
  if (row.type === 'trend') {
    return {
      id: row.id,
      type: 'trend',
      name: row.name,
      description: row.description ?? undefined,
      startDate: row.start_date,
      targetDate: row.target_date,
      tags: row.tags ?? [],
      relatedGoalIds: row.related_goal_ids ?? [],
      archivedAt: row.archived_at,
      startValue: row.start_value ?? 0,
      targetValue: row.target_value ?? 0,
      direction: row.direction ?? 'up',
      unit: row.unit ?? '',
      logs,
    };
  }
  if (row.type === 'accumulation') {
    return {
      id: row.id,
      type: 'accumulation',
      name: row.name,
      description: row.description ?? undefined,
      startDate: row.start_date,
      targetDate: row.target_date,
      tags: row.tags ?? [],
      relatedGoalIds: row.related_goal_ids ?? [],
      archivedAt: row.archived_at,
      targetTotal: row.target_total ?? 0,
      unit: row.unit ?? '',
      logs,
    };
  }
  return {
    id: row.id,
    type: 'milestone',
    name: row.name,
    description: row.description ?? undefined,
    startDate: row.start_date,
    targetDate: row.target_date,
    tags: row.tags ?? [],
    relatedGoalIds: row.related_goal_ids ?? [],
    archivedAt: row.archived_at,
    milestones: (milestonesByGoal.get(row.id) ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      dueDate: item.due_date,
      done: item.done,
      doneAt: item.done_at,
    })),
    logs,
  };
}

function computeDailyState(goal: DailyGoal, entry: GoalDailyEntryRow | undefined) {
  if (!entry) return 'idle' as const;
  if (goal.kind === 'check') return entry.done ? 'done' : 'idle';
  const count = entry.count ?? 0;
  const target = goal.target ?? 1;
  if (count >= target) return 'done' as const;
  if (count > 0) return 'partial' as const;
  return 'idle' as const;
}

const tagsKey = (userId: string | undefined) => ['goals_tags', userId] as const;
const longKey = (userId: string | undefined) => ['goals_long', userId] as const;
const longLogsKey = (userId: string | undefined) => ['goals_long_logs', userId] as const;
const milestonesKey = (userId: string | undefined) => ['goals_long_milestones', userId] as const;
const dailyKey = (userId: string | undefined) => ['goals_daily', userId] as const;
const dailyEntriesKey = (userId: string | undefined, date: string) =>
  ['goals_daily_entries', userId, date] as const;
const dailyEntriesRangeKey = (userId: string | undefined, from: string, to: string) =>
  ['goals_daily_entries_range', userId, from, to] as const;

export interface GoalsStoreState {
  tags: Tag[];
  longGoals: LongGoal[];
  dailyGoals: DailyGoal[];
  todayEntries: DailyGoalEntries;
  weekHist: DailyGoalWeekHistory;
  streaks: DailyGoalStreaks;
  toast: string | null;
}

export interface GoalsStoreActions {
  showToast: (message: string) => void;
  tagById: (id: string) => Tag | undefined;
  goalById: (id: string) => LongGoal | DailyGoal | undefined;
  addTag: (name: string, color: string) => Promise<string>;
  toggleDailyCheck: (goalId: string) => Promise<void>;
  setDailyCount: (goalId: string, value: number) => Promise<void>;
  addLog: (goalId: string, log: Omit<LogEntry, 'id' | 'at'> & { at?: string }) => Promise<void>;
  toggleMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  addLongGoal: (goal: NewLongGoalInput) => Promise<string>;
  reorderLongGoals: (goalIdsInOrder: string[]) => Promise<void>;
  addDailyGoal: (goal: NewDailyGoalInput) => Promise<string>;
  updateLongGoal: (goalId: string, goal: NewLongGoalInput) => Promise<void>;
  archiveLongGoal: (goalId: string) => Promise<void>;
  archiveDailyGoal: (goalId: string) => Promise<void>;
}

export type GoalsStore = GoalsStoreState & GoalsStoreActions;

export function useGoalsStore(): GoalsStore {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const today = todayDateString();
  const weekStart = dateDaysAgo(6);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2_200);
  }, []);

  const tagsQuery = useQuery({
    queryKey: tagsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from('goals_tags')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as GoalTagRow[]).map(mapTag);
    },
  });

  const longQuery = useQuery({
    queryKey: longKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<GoalLongRow[]> => {
      const { data, error } = await supabase
        .from('goals_long')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoalLongRow[];
    },
  });

  const logsQuery = useQuery({
    queryKey: longLogsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<GoalLongLogRow[]> => {
      const { data, error } = await supabase
        .from('goals_long_logs')
        .select('*')
        .order('at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as GoalLongLogRow[];
    },
  });

  const milestonesQuery = useQuery({
    queryKey: milestonesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<GoalMilestoneRow[]> => {
      const { data, error } = await supabase
        .from('goals_long_milestones')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as GoalMilestoneRow[];
    },
  });

  const dailyQuery = useQuery({
    queryKey: dailyKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<GoalDailyRow[]> => {
      const { data, error } = await supabase
        .from('goals_daily')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as GoalDailyRow[];
    },
  });

  const dailyEntriesTodayQuery = useQuery({
    queryKey: dailyEntriesKey(user?.id, today),
    enabled: !!user,
    queryFn: async (): Promise<GoalDailyEntryRow[]> => {
      const { data, error } = await supabase
        .from('goals_daily_entries')
        .select('*')
        .eq('date', today);
      if (error) throw error;
      return (data ?? []) as GoalDailyEntryRow[];
    },
  });

  const dailyEntriesWeekQuery = useQuery({
    queryKey: dailyEntriesRangeKey(user?.id, weekStart, today),
    enabled: !!user,
    queryFn: async (): Promise<GoalDailyEntryRow[]> => {
      const { data, error } = await supabase
        .from('goals_daily_entries')
        .select('*')
        .gte('date', weekStart)
        .lte('date', today)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as GoalDailyEntryRow[];
    },
  });

  const longGoals = useMemo(() => {
    const logsByGoal = new Map<string, LogEntry[]>();
    (logsQuery.data ?? []).forEach((row) => {
      const existing = logsByGoal.get(row.long_goal_id) ?? [];
      existing.push(mapLog(row));
      logsByGoal.set(row.long_goal_id, existing);
    });
    const milestonesByGoal = new Map<string, GoalMilestoneRow[]>();
    (milestonesQuery.data ?? []).forEach((row) => {
      const existing = milestonesByGoal.get(row.long_goal_id) ?? [];
      existing.push(row);
      milestonesByGoal.set(row.long_goal_id, existing);
    });
    return (longQuery.data ?? []).map((row) => mapLong(row, logsByGoal, milestonesByGoal));
  }, [logsQuery.data, longQuery.data, milestonesQuery.data]);
  const nextLongSortOrder = useMemo(() => {
    return (longQuery.data ?? [])
      .filter((row) => !row.archived_at)
      .reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
  }, [longQuery.data]);

  const dailyGoals = useMemo(() => (dailyQuery.data ?? []).map(mapDaily), [dailyQuery.data]);

  const todayEntries = useMemo(() => {
    return (dailyEntriesTodayQuery.data ?? []).reduce<DailyGoalEntries>((acc, row) => {
      acc[row.daily_goal_id] = {
        done: row.done ?? undefined,
        count: row.count ?? undefined,
        loggedAt: row.logged_at,
      };
      return acc;
    }, {});
  }, [dailyEntriesTodayQuery.data]);

  const weekHist = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, index) => dateDaysAgo(6 - index));
    const entriesByGoalDate = new Map<string, GoalDailyEntryRow>();
    (dailyEntriesWeekQuery.data ?? []).forEach((row) => {
      entriesByGoalDate.set(`${row.daily_goal_id}:${row.date}`, row);
    });
    return dailyGoals.reduce<DailyGoalWeekHistory>((acc, goal) => {
      acc[goal.id] = dates.map((date) => {
        const row = entriesByGoalDate.get(`${goal.id}:${date}`);
        return computeDailyState(goal, row);
      });
      return acc;
    }, {});
  }, [dailyEntriesWeekQuery.data, dailyGoals]);

  const streaks = useMemo(() => {
    return (dailyQuery.data ?? []).reduce<DailyGoalStreaks>((acc, row) => {
      acc[row.id] = row.streak ?? 0;
      return acc;
    }, {});
  }, [dailyQuery.data]);

  const tagById = useCallback((id: string) => (tagsQuery.data ?? []).find((tag) => tag.id === id), [tagsQuery.data]);

  const goalById = useCallback(
    (id: string) => longGoals.find((goal) => goal.id === id) ?? dailyGoals.find((goal) => goal.id === id),
    [dailyGoals, longGoals],
  );

  const addTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!user) throw new Error('Not signed in');
      const current = tagsQuery.data ?? [];
      const { data, error } = await supabase
        .from('goals_tags')
        .insert({
          user_id: user.id,
          name,
          color,
          sort_order: current.length,
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapTag(data as GoalTagRow);
    },
    onSuccess: (created) => {
      qc.setQueryData<Tag[]>(tagsKey(user?.id), (prev) => [...(prev ?? []), created]);
    },
  });

  const addLongGoalMutation = useMutation({
    mutationFn: async (goal: NewLongGoalInput) => {
      if (!user) throw new Error('Not signed in');
      const base = {
        user_id: user.id,
        type: goal.type,
        name: goal.name,
        description: goal.description ?? null,
        start_date: goal.startDate,
        target_date: goal.targetDate,
        tags: goal.tags ?? [],
        related_goal_ids: goal.relatedGoalIds ?? [],
        archived_at: goal.archivedAt ?? null,
        start_value: goal.type === 'trend' ? goal.startValue : null,
        target_value: goal.type === 'trend' ? goal.targetValue : null,
        direction: goal.type === 'trend' ? goal.direction : null,
        unit: goal.type !== 'milestone' ? goal.unit : null,
        target_total: goal.type === 'accumulation' ? goal.targetTotal : null,
        sort_order: nextLongSortOrder,
      };
      const { data, error } = await supabase.from('goals_long').insert(base).select('*').single();
      if (error) throw error;
      const created = data as GoalLongRow;

      if (goal.type === 'milestone' && goal.milestones.length > 0) {
        const rows = goal.milestones.map((item, index) => ({
          long_goal_id: created.id,
          user_id: user.id,
          name: item.name,
          due_date: item.dueDate,
          done: item.done,
          done_at: item.doneAt,
          sort_order: index,
        }));
        const milestonesInsert = await supabase.from('goals_long_milestones').insert(rows);
        if (milestonesInsert.error) throw milestonesInsert.error;
      }
      return created.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: longKey(user?.id) });
      qc.invalidateQueries({ queryKey: milestonesKey(user?.id) });
      showToast('Long-term goal created.');
    },
  });

  const reorderLongGoalsMutation = useMutation({
    mutationFn: async (goalIdsInOrder: string[]) => {
      if (!user) throw new Error('Not signed in');
      for (let index = 0; index < goalIdsInOrder.length; index += 1) {
        const goalId = goalIdsInOrder[index];
        const { error } = await supabase
          .from('goals_long')
          .update({ sort_order: index })
          .eq('id', goalId)
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: longKey(user?.id) });
    },
  });

  const addDailyGoalMutation = useMutation({
    mutationFn: async (goal: NewDailyGoalInput) => {
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('goals_daily')
        .insert({
          user_id: user.id,
          name: goal.name,
          notes: goal.notes ?? null,
          schedule: goal.schedule,
          kind: goal.kind,
          target: goal.target ?? null,
          unit: goal.unit ?? null,
          time_of_day: goal.timeOfDay ?? null,
          tags: goal.tags ?? [],
          linked_to: goal.linkedTo ?? null,
          archived_at: goal.archivedAt ?? null,
          streak: 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dailyKey(user?.id) });
      showToast('Daily goal created.');
    },
  });

  const addLogMutation = useMutation({
    mutationFn: async ({
      goalId,
      log,
    }: {
      goalId: string;
      log: Omit<LogEntry, 'id' | 'at'> & { at?: string };
    }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('goals_long_logs').insert({
        long_goal_id: goalId,
        user_id: user.id,
        at: log.at ?? new Date().toISOString(),
        value: log.value ?? null,
        note: log.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: longLogsKey(user?.id) });
      showToast('Log entry added.');
    },
  });

  const updateLongGoalMutation = useMutation({
    mutationFn: async ({ goalId, goal }: { goalId: string; goal: NewLongGoalInput }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('goals_long')
        .update({
          type: goal.type,
          name: goal.name,
          description: goal.description ?? null,
          start_date: goal.startDate,
          target_date: goal.targetDate,
          tags: goal.tags ?? [],
          related_goal_ids: goal.relatedGoalIds ?? [],
          archived_at: goal.archivedAt ?? null,
          start_value: goal.type === 'trend' ? goal.startValue : null,
          target_value: goal.type === 'trend' ? goal.targetValue : null,
          direction: goal.type === 'trend' ? goal.direction : null,
          unit: goal.type !== 'milestone' ? goal.unit : null,
          target_total: goal.type === 'accumulation' ? goal.targetTotal : null,
        })
        .eq('id', goalId);
      if (error) throw error;

      const deleteMilestones = await supabase.from('goals_long_milestones').delete().eq('long_goal_id', goalId);
      if (deleteMilestones.error) throw deleteMilestones.error;

      if (goal.type === 'milestone' && goal.milestones.length > 0) {
        const rows = goal.milestones.map((item, index) => ({
          long_goal_id: goalId,
          user_id: user.id,
          name: item.name,
          due_date: item.dueDate,
          done: item.done,
          done_at: item.doneAt,
          sort_order: index,
        }));
        const milestonesInsert = await supabase.from('goals_long_milestones').insert(rows);
        if (milestonesInsert.error) throw milestonesInsert.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: longKey(user?.id) });
      qc.invalidateQueries({ queryKey: milestonesKey(user?.id) });
      showToast('Goal updated.');
    },
  });

  const archiveLongGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase
        .from('goals_long')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: longKey(user?.id) });
      showToast('Goal archived.');
    },
  });

  const archiveDailyGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase
        .from('goals_daily')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dailyKey(user?.id) });
      showToast('Daily goal archived.');
    },
  });

  const toggleMilestoneMutation = useMutation({
    mutationFn: async ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) => {
      const milestone = (milestonesQuery.data ?? []).find(
        (item) => item.id === milestoneId && item.long_goal_id === goalId,
      );
      if (!milestone) return;
      const { error } = await supabase
        .from('goals_long_milestones')
        .update({
          done: !milestone.done,
          done_at: milestone.done ? null : new Date().toISOString(),
        })
        .eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: milestonesKey(user?.id) });
    },
  });

  const upsertDailyEntry = useCallback(
    async ({
      goalId,
      patch,
      streakDelta,
    }: {
      goalId: string;
      patch: { done?: boolean; count?: number };
      streakDelta?: number;
    }) => {
      if (!user) throw new Error('Not signed in');
      const payload = {
        daily_goal_id: goalId,
        user_id: user.id,
        date: today,
        done: patch.done ?? null,
        count: patch.count ?? null,
        logged_at: new Date().toISOString(),
      };
      const upsert = await supabase
        .from('goals_daily_entries')
        .upsert(payload, { onConflict: 'daily_goal_id,date' });
      if (upsert.error) throw upsert.error;

      if (streakDelta && streakDelta !== 0) {
        const row = (dailyQuery.data ?? []).find((item) => item.id === goalId);
        const nextStreak = Math.max(0, (row?.streak ?? 0) + streakDelta);
        const streakUpdate = await supabase
          .from('goals_daily')
          .update({ streak: nextStreak })
          .eq('id', goalId);
        if (streakUpdate.error) throw streakUpdate.error;
      }
    },
    [dailyQuery.data, today, user],
  );

  const toggleDailyCheckMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const current = todayEntries[goalId];
      const nextDone = !(current?.done === true);
      await upsertDailyEntry({
        goalId,
        patch: { done: nextDone, count: undefined },
        streakDelta: nextDone ? 1 : -1,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dailyEntriesKey(user?.id, today) });
      qc.invalidateQueries({ queryKey: dailyEntriesRangeKey(user?.id, weekStart, today) });
      qc.invalidateQueries({ queryKey: dailyKey(user?.id) });
    },
  });

  const setDailyCountMutation = useMutation({
    mutationFn: async ({ goalId, value }: { goalId: string; value: number }) => {
      const goal = dailyGoals.find((item) => item.id === goalId);
      const target = Math.max(1, goal?.target ?? 1);
      const prev = todayEntries[goalId]?.count ?? 0;
      const next = Math.max(0, value);
      const crossedUp = prev < target && next >= target;
      const crossedDown = prev >= target && next < target;
      await upsertDailyEntry({
        goalId,
        patch: { count: next, done: undefined },
        streakDelta: crossedUp ? 1 : crossedDown ? -1 : 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dailyEntriesKey(user?.id, today) });
      qc.invalidateQueries({ queryKey: dailyEntriesRangeKey(user?.id, weekStart, today) });
      qc.invalidateQueries({ queryKey: dailyKey(user?.id) });
    },
  });

  return {
    tags: tagsQuery.data ?? [],
    longGoals,
    dailyGoals,
    todayEntries,
    weekHist,
    streaks,
    toast,
    showToast,
    tagById,
    goalById,
    addTag: async (name: string, color: string) => {
      const created = await addTagMutation.mutateAsync({ name, color });
      return created.id;
    },
    toggleDailyCheck: async (goalId: string) => {
      await toggleDailyCheckMutation.mutateAsync(goalId);
    },
    setDailyCount: async (goalId: string, value: number) => {
      await setDailyCountMutation.mutateAsync({ goalId, value });
    },
    addLog: async (goalId: string, log: Omit<LogEntry, 'id' | 'at'> & { at?: string }) => {
      await addLogMutation.mutateAsync({ goalId, log });
    },
    toggleMilestone: async (goalId: string, milestoneId: string) => {
      await toggleMilestoneMutation.mutateAsync({ goalId, milestoneId });
    },
    addLongGoal: async (goal: NewLongGoalInput) => addLongGoalMutation.mutateAsync(goal),
    reorderLongGoals: async (goalIdsInOrder: string[]) => {
      await reorderLongGoalsMutation.mutateAsync(goalIdsInOrder);
    },
    addDailyGoal: async (goal: NewDailyGoalInput) => addDailyGoalMutation.mutateAsync(goal),
    updateLongGoal: async (goalId: string, goal: NewLongGoalInput) =>
      updateLongGoalMutation.mutateAsync({ goalId, goal }),
    archiveLongGoal: async (goalId: string) => {
      await archiveLongGoalMutation.mutateAsync(goalId);
    },
    archiveDailyGoal: async (goalId: string) => {
      await archiveDailyGoalMutation.mutateAsync(goalId);
    },
  };
}
