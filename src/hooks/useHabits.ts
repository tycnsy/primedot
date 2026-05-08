import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  Habit,
  HabitEntry,
  NewHabit,
  Schedule,
} from '../features/habits/types';
import { cadenceStatusForDate, calcHabitStatsScheduleAware } from '../features/habits/metrics';

type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  kind: Habit['kind'];
  schedule: Schedule | { type: 'times-per-week'; count: number };
  target: number | null;
  unit: string | null;
  scale_max: number | null;
  time_of_day: Habit['timeOfDay'];
  sort_order: number;
  created_at: string;
  archived_at: string | null;
  notes: string | null;
  tags: string[] | null;
};

type HabitEntryRow = {
  id: string;
  habit_id: string;
  user_id: string;
  date: string;
  done: boolean | null;
  count: number | null;
  scale: number | null;
  note_text: string | null;
  logged_at: string;
};

type LogItem = {
  date: string;
  status: 'done' | 'skip' | 'partial';
  detail?: string;
};

const habitsKey = (userId: string | undefined) => ['habits', userId] as const;
const entriesKey = (userId: string | undefined, date: string) =>
  ['habit_entries', userId, date] as const;
const entriesRangeKey = (
  userId: string | undefined,
  from: string | null,
  to: string | null,
) => ['habit_entries_range', userId, from, to] as const;
const habitDetailKey = (habitId: string | undefined) => ['habit_detail', habitId] as const;
const habitHistoryKey = (habitId: string | undefined) => ['habit_history', habitId] as const;
const habitDetailHistoryDays = 182;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSchedule(
  schedule: HabitRow['schedule'],
): Schedule {
  if (schedule.type === 'times-per-week') {
    return { type: 'every-n-days', count: 2 };
  }
  return schedule;
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    schedule: normalizeSchedule(row.schedule),
    target: row.target ?? undefined,
    unit: row.unit ?? undefined,
    scaleMax: row.scale_max ?? undefined,
    timeOfDay: row.time_of_day ?? null,
    order: row.sort_order,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    notes: row.notes ?? undefined,
    tags: row.tags ?? undefined,
  };
}

function toHabitInsert(userId: string, input: NewHabit, sortOrder: number) {
  return {
    user_id: userId,
    name: input.name,
    kind: input.kind,
    schedule: input.schedule,
    target: input.target ?? null,
    unit: input.unit ?? null,
    scale_max: input.scaleMax ?? null,
    time_of_day: input.timeOfDay ?? null,
    sort_order: sortOrder,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
  };
}

function mapEntry(row: HabitEntryRow): HabitEntry {
  return {
    id: row.id,
    habitId: row.habit_id,
    userId: row.user_id,
    date: row.date,
    done: row.done ?? undefined,
    count: row.count ?? undefined,
    scale: row.scale ?? undefined,
    noteText: row.note_text ?? undefined,
    loggedAt: row.logged_at,
  };
}

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function useHabits() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const habitsQuery = useQuery({
    queryKey: habitsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as HabitRow[];
      const legacyRows = rows.filter((row) => row.schedule?.type === 'times-per-week');
      if (legacyRows.length > 0) {
        await Promise.all(
          legacyRows.map((row) =>
            supabase
              .from('habits')
              .update({ schedule: { type: 'every-n-days', count: 2 } })
              .eq('id', row.id),
          ),
        );
      }
      return rows.map(mapHabit);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: NewHabit) => {
      if (!user) throw new Error('Not signed in');
      const current = qc.getQueryData<Habit[]>(habitsKey(user.id)) ?? [];
      const sortOrder = current.length;
      const { data, error } = await supabase
        .from('habits')
        .insert(toHabitInsert(user.id, input, sortOrder))
        .select('*')
        .single();
      if (error) throw error;
      return mapHabit(data as HabitRow);
    },
    onSuccess: (created) => {
      qc.setQueryData<Habit[]>(habitsKey(user?.id), (prev) => [...(prev ?? []), created]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Habit> }) => {
      const payload: Record<string, unknown> = {};
      if ('name' in patch) payload.name = patch.name;
      if ('kind' in patch) payload.kind = patch.kind;
      if ('schedule' in patch) payload.schedule = patch.schedule;
      if ('target' in patch) payload.target = patch.target ?? null;
      if ('unit' in patch) payload.unit = patch.unit ?? null;
      if ('scaleMax' in patch) payload.scale_max = patch.scaleMax ?? null;
      if ('timeOfDay' in patch) payload.time_of_day = patch.timeOfDay ?? null;
      if ('order' in patch) payload.sort_order = patch.order;
      if ('notes' in patch) payload.notes = patch.notes ?? null;
      if ('tags' in patch) payload.tags = patch.tags ?? [];
      if ('archivedAt' in patch) payload.archived_at = patch.archivedAt;
      const { data, error } = await supabase
        .from('habits')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapHabit(data as HabitRow);
    },
    onSuccess: (updated) => {
      qc.setQueryData<Habit[]>(
        habitsKey(user?.id),
        (prev) => prev?.map((habit) => (habit.id === updated.id ? updated : habit)) ?? [],
      );
      qc.invalidateQueries({ queryKey: habitDetailKey(updated.id) });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const archivedAt = new Date().toISOString();
      const { error } = await supabase
        .from('habits')
        .update({ archived_at: archivedAt })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.setQueryData<Habit[]>(
        habitsKey(user?.id),
        (prev) =>
          prev?.map((habit) =>
            habit.id === id ? { ...habit, archivedAt: new Date().toISOString() } : habit,
          ) ?? [],
      );
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('habits').update({ sort_order: index }).eq('id', id).select('id').single(),
        ),
      );
      const firstError = updates.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      return orderedIds;
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: habitsKey(user?.id) });
      const previous = qc.getQueryData<Habit[]>(habitsKey(user?.id));
      if (previous) {
        const byId = new Map(previous.map((habit) => [habit.id, habit]));
        const next = orderedIds
          .map((id, index) => {
            const habit = byId.get(id);
            if (!habit) return null;
            return { ...habit, order: index };
          })
          .filter((habit): habit is Habit => !!habit);
        qc.setQueryData(habitsKey(user?.id), next);
      }
      return { previous };
    },
    onError: (_error, _orderedIds, context) => {
      if (context?.previous) {
        qc.setQueryData(habitsKey(user?.id), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: habitsKey(user?.id) });
    },
  });

  const all = habitsQuery.data ?? [];
  const active = all.filter((habit) => !habit.archivedAt);
  const archived = all.filter((habit) => !!habit.archivedAt);

  return {
    habits: active,
    archivedHabits: archived,
    isLoading: habitsQuery.isLoading,
    error: habitsQuery.error as Error | null,
    createHabit: (input: NewHabit) => createMutation.mutateAsync(input),
    updateHabit: (id: string, patch: Partial<Habit>) =>
      updateMutation.mutateAsync({ id, patch }),
    archiveHabit: (id: string) => archiveMutation.mutateAsync(id),
    reorderHabits: (ids: string[]) => reorderMutation.mutateAsync(ids),
  };
}

export function useEntries(date: string = todayDateString()) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: entriesKey(user?.id, date),
    enabled: !!user,
    queryFn: async (): Promise<Record<string, HabitEntry>> => {
      const { data, error } = await supabase
        .from('habit_entries')
        .select('*')
        .eq('date', date);
      if (error) throw error;
      return ((data ?? []) as HabitEntryRow[]).reduce<Record<string, HabitEntry>>((acc, row) => {
        const entry = mapEntry(row);
        acc[entry.habitId] = entry;
        return acc;
      }, {});
    },
  });

  const setEntryMutation = useMutation({
    mutationFn: async ({
      habitId,
      patch,
    }: {
      habitId: string;
      patch: Partial<HabitEntry>;
    }) => {
      if (!user) throw new Error('Not signed in');
      const payload = {
        habit_id: habitId,
        user_id: user.id,
        date,
        done: patch.done ?? null,
        count: patch.count ?? null,
        scale: patch.scale ?? null,
        note_text: patch.noteText ?? null,
        logged_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('habit_entries')
        .upsert(payload, { onConflict: 'habit_id,date' })
        .select('*')
        .single();
      if (error) throw error;
      return mapEntry(data as HabitEntryRow);
    },
    onMutate: async ({ habitId, patch }) => {
      await qc.cancelQueries({ queryKey: entriesKey(user?.id, date) });
      const previous =
        qc.getQueryData<Record<string, HabitEntry>>(entriesKey(user?.id, date)) ?? {};
      const nextEntry = {
        ...previous[habitId],
        habitId,
        date,
        ...patch,
      };
      qc.setQueryData(entriesKey(user?.id, date), { ...previous, [habitId]: nextEntry });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(entriesKey(user?.id, date), context.previous);
      }
    },
    onSuccess: (entry) => {
      qc.setQueryData<Record<string, HabitEntry>>(entriesKey(user?.id, date), (prev) => ({
        ...(prev ?? {}),
        [entry.habitId]: entry,
      }));
      qc.invalidateQueries({ queryKey: habitHistoryKey(entry.habitId) });
      qc.invalidateQueries({ queryKey: habitDetailKey(entry.habitId) });
    },
  });

  return {
    entries: entriesQuery.data ?? {},
    isLoading: entriesQuery.isLoading,
    error: entriesQuery.error as Error | null,
    toggleCheck: async (habitId: string) => {
      const existing = (entriesQuery.data ?? {})[habitId];
      await setEntryMutation.mutateAsync({
        habitId,
        patch: { done: !(existing?.done === true), count: undefined, scale: undefined, noteText: undefined },
      });
    },
    setCount: (habitId: string, n: number) =>
      setEntryMutation.mutateAsync({
        habitId,
        patch: { count: n, done: undefined, scale: undefined, noteText: undefined },
      }),
    setScale: (habitId: string, n: number) =>
      setEntryMutation.mutateAsync({
        habitId,
        patch: { scale: n, done: undefined, count: undefined, noteText: undefined },
      }),
    setNote: (habitId: string, text: string) =>
      setEntryMutation.mutateAsync({
        habitId,
        patch: { noteText: text, done: undefined, count: undefined, scale: undefined },
      }),
  };
}

export function useEntriesRange(from: string | null, to: string | null) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: entriesRangeKey(user?.id, from, to),
    enabled: !!user,
    queryFn: async (): Promise<HabitEntry[]> => {
      let request = supabase
        .from('habit_entries')
        .select('*')
        .order('date', { ascending: true });

      if (from) request = request.gte('date', from);
      if (to) request = request.lte('date', to);

      const { data, error } = await request;
      if (error) throw error;
      return ((data ?? []) as HabitEntryRow[]).map(mapEntry);
    },
  });

  const byHabit = useMemo(() => {
    return (query.data ?? []).reduce<Record<string, HabitEntry[]>>((acc, entry) => {
      if (!acc[entry.habitId]) acc[entry.habitId] = [];
      acc[entry.habitId].push(entry);
      return acc;
    }, {});
  }, [query.data]);

  return {
    entries: query.data ?? [],
    entriesByHabit: byHabit,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

export function useHabitStreaks(habits: Habit[], anchorDate: string = todayDateString()) {
  const history = useEntriesRange(null, anchorDate);

  const summary = useMemo(() => {
    return habits.reduce<{
      streaksByHabit: Record<string, number>;
      notDueTodayByHabit: Record<string, boolean>;
      notDueLabelByHabit: Record<string, string | null>;
    }>(
      (acc, habit) => {
        const entries = history.entriesByHabit[habit.id] ?? [];
        acc.streaksByHabit[habit.id] = calcHabitStatsScheduleAware(
          habit,
          entries,
          anchorDate,
        ).currentStreak;

        if (habit.schedule.type === 'every-n-days') {
          const status = cadenceStatusForDate(habit, entries, anchorDate);
          const notDueToday = !status.due && !status.completedOnDate;
          acc.notDueTodayByHabit[habit.id] = notDueToday;
          if (notDueToday && status.daysSinceLastCompletion === 1) {
            acc.notDueLabelByHabit[habit.id] = 'Done yesterday · not due today';
          } else if (notDueToday && status.daysUntilDue > 0) {
            acc.notDueLabelByHabit[habit.id] =
              status.daysUntilDue === 1
                ? 'Not due today · due tomorrow'
                : `Not due today · due in ${status.daysUntilDue} days`;
          } else {
            acc.notDueLabelByHabit[habit.id] = null;
          }
        } else {
          acc.notDueTodayByHabit[habit.id] = false;
          acc.notDueLabelByHabit[habit.id] = null;
        }
        return acc;
      },
      { streaksByHabit: {}, notDueTodayByHabit: {}, notDueLabelByHabit: {} },
    );
  }, [anchorDate, habits, history.entriesByHabit]);

  return {
    streaksByHabit: summary.streaksByHabit,
    notDueTodayByHabit: summary.notDueTodayByHabit,
    notDueLabelByHabit: summary.notDueLabelByHabit,
    isLoading: history.isLoading,
    error: history.error,
  };
}

export function useHabitDetail(habitId: string | undefined) {
  const habitQuery = useQuery({
    queryKey: habitDetailKey(habitId),
    enabled: !!habitId,
    queryFn: async (): Promise<Habit> => {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('id', habitId!)
        .single();
      if (error) throw error;
      return mapHabit(data as HabitRow);
    },
  });

  const historyQuery = useQuery({
    queryKey: habitHistoryKey(habitId),
    enabled: !!habitId,
    queryFn: async (): Promise<HabitEntry[]> => {
      const from = dateDaysAgo(habitDetailHistoryDays);
      const { data, error } = await supabase
        .from('habit_entries')
        .select('*')
        .eq('habit_id', habitId!)
        .gte('date', from)
        .order('date', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as HabitEntryRow[]).map(mapEntry);
    },
  });

  const stats = useMemo(() => {
    if (!habitQuery.data) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        thisMonth: { done: 0, total: 0 },
        consistency: 0,
        total: 0,
      };
    }
    return calcHabitStatsScheduleAware(
      habitQuery.data,
      historyQuery.data ?? [],
      new Date().toISOString().slice(0, 10),
    );
  }, [habitQuery.data, historyQuery.data]);

  const log = (): LogItem[] => {
    const currentHabit = habitQuery.data;
    if (!currentHabit) return [];
    return (historyQuery.data ?? []).map((entry) => ({
      date: entry.date,
      status:
        currentHabit.kind === 'count'
          ? (entry.count ?? 0) >= (currentHabit.target ?? 1)
            ? 'done'
            : 'partial'
          : currentHabit.kind === 'check'
            ? entry.done
              ? 'done'
              : 'partial'
            : currentHabit.kind === 'scale'
              ? (entry.scale ?? 0) > 0
                ? 'done'
                : 'partial'
              : entry.noteText?.trim()
                ? 'done'
                : 'partial',
      detail: entry.noteText ?? (entry.count != null ? `${entry.count}` : undefined),
    }));
  };

  return {
    habit: habitQuery.data ?? null,
    entries: historyQuery.data ?? [],
    stats,
    log,
    isLoading: habitQuery.isLoading || historyQuery.isLoading,
    error: (habitQuery.error ?? historyQuery.error) as Error | null,
  };
}
