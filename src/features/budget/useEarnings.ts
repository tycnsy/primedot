import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { monthKey } from './compute/dates';
import {
  mapMonthlyEarningsGoal,
  mapMonthlyEarningsSnapshot,
  type MonthlyEarningsGoal,
  type MonthlyEarningsGoalRow,
  type MonthlyEarningsSnapshot,
  type MonthlyEarningsSnapshotRow,
} from './types';

const snapshotsKey = (userId: string | undefined) =>
  ['budget_monthly_earnings_snapshots', userId] as const;
const goalsKey = (userId: string | undefined) =>
  ['budget_monthly_earnings_goals', userId] as const;

export function useEarnings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const snapshotsQuery = useQuery({
    queryKey: snapshotsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<MonthlyEarningsSnapshot[]> => {
      const { data, error } = await supabase
        .from('budget_monthly_earnings_snapshots')
        .select('*')
        .order('recorded_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as MonthlyEarningsSnapshotRow[]).map(mapMonthlyEarningsSnapshot);
    },
  });

  const goalsQuery = useQuery({
    queryKey: goalsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<MonthlyEarningsGoal[]> => {
      const { data, error } = await supabase
        .from('budget_monthly_earnings_goals')
        .select('*')
        .order('earned_month', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as MonthlyEarningsGoalRow[]).map(mapMonthlyEarningsGoal);
    },
  });

  const goalsByMonth = useMemo(() => {
    const map = new Map<string, MonthlyEarningsGoal>();
    for (const goal of goalsQuery.data ?? []) {
      map.set(monthKey(goal.earnedMonth), goal);
    }
    return map;
  }, [goalsQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: snapshotsKey(user?.id) });
    qc.invalidateQueries({ queryKey: goalsKey(user?.id) });
  };

  const setGoalMutation = useMutation({
    mutationFn: async ({ month, amount }: { month: string; amount: number }) => {
      if (!user) throw new Error('Not signed in');
      const earnedMonth = monthKey(month);
      const { data: existing, error: fetchError } = await supabase
        .from('budget_monthly_earnings_goals')
        .select('id')
        .eq('user_id', user.id)
        .eq('earned_month', earnedMonth)
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (existing) {
        const { error } = await supabase
          .from('budget_monthly_earnings_goals')
          .update({ goal_amount: amount })
          .eq('id', existing.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('budget_monthly_earnings_goals').insert({
          user_id: user.id,
          earned_month: earnedMonth,
          goal_amount: amount,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (month: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_monthly_earnings_goals')
        .delete()
        .eq('user_id', user.id)
        .eq('earned_month', monthKey(month));
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteSnapshotMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_monthly_earnings_snapshots')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateSnapshotMutation = useMutation({
    mutationFn: async ({
      id,
      recordedAt,
      totalAmount,
    }: {
      id: string;
      recordedAt: string;
      totalAmount: number;
    }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_monthly_earnings_snapshots')
        .update({
          recorded_at: recordedAt,
          total_amount: totalAmount,
        })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    snapshots: snapshotsQuery.data ?? [],
    goals: goalsQuery.data ?? [],
    goalsByMonth,
    isLoading: snapshotsQuery.isLoading || goalsQuery.isLoading,
    setGoal: (month: string, amount: number) =>
      setGoalMutation.mutateAsync({ month, amount }),
    deleteGoal: (month: string) => deleteGoalMutation.mutateAsync(month),
    deleteSnapshot: (id: string) => deleteSnapshotMutation.mutateAsync(id),
    updateSnapshot: (id: string, patch: { recordedAt: string; totalAmount: number }) =>
      updateSnapshotMutation.mutateAsync({ id, ...patch }),
  };
}

export { snapshotsKey as earningsSnapshotsKey, goalsKey as earningsGoalsKey };
