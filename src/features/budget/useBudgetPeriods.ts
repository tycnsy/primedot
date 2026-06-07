import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  mapBudgetPeriod,
  type BudgetPeriod,
  type BudgetPeriodRow,
} from './types';
import { monthKey } from './compute/dates';

const periodsKey = (userId: string | undefined) => ['budget_periods', userId] as const;

export function useBudgetPeriods() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: periodsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<BudgetPeriod[]> => {
      const { data, error } = await supabase
        .from('budget_periods')
        .select('*')
        .order('month', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as BudgetPeriodRow[]).map(mapBudgetPeriod);
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ month, carryOverAmount }: { month: string; carryOverAmount: number }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('budget_periods').upsert(
        {
          user_id: user.id,
          month: monthKey(month),
          carry_over_amount: carryOverAmount,
        },
        { onConflict: 'user_id,month' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: periodsKey(user?.id) }),
  });

  const periods = query.data ?? [];
  const byMonth = useMemo(() => {
    return periods.reduce<Record<string, BudgetPeriod>>((acc, period) => {
      acc[monthKey(period.month)] = period;
      return acc;
    }, {});
  }, [periods]);

  return {
    periods,
    periodsByMonth: byMonth,
    carryOverFor: (month: string) => byMonth[monthKey(month)]?.carryOverAmount ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    setCarryOver: (month: string, carryOverAmount: number) =>
      upsertMutation.mutateAsync({ month, carryOverAmount }),
  };
}
