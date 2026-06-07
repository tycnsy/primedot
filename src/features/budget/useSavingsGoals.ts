import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  mapSavingsGoal,
  type NewSavingsGoalInput,
  type SavingsGoal,
  type SavingsGoalRow,
} from './types';

const savingsKey = (userId: string | undefined) => ['budget_savings', userId] as const;
const transactionsKey = (userId: string | undefined) =>
  ['budget_transactions', userId] as const;
const accountsKey = (userId: string | undefined) => ['budget_accounts', userId] as const;

export function useSavingsGoals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: savingsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await supabase
        .from('budget_savings_goals')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as SavingsGoalRow[]).map(mapSavingsGoal);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: NewSavingsGoalInput) => {
      if (!user) throw new Error('Not signed in');
      const current = qc.getQueryData<SavingsGoal[]>(savingsKey(user.id)) ?? [];
      const { data, error } = await supabase
        .from('budget_savings_goals')
        .insert({
          user_id: user.id,
          name: input.name,
          target_amount: input.targetAmount,
          target_date: input.targetDate ?? null,
          linked_account_id: input.linkedAccountId ?? null,
          contributed_amount: input.contributedAmount ?? 0,
          sort_order: current.length,
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapSavingsGoal(data as SavingsGoalRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savingsKey(user?.id) }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SavingsGoal> }) => {
      const payload: Record<string, unknown> = {};
      if ('name' in patch) payload.name = patch.name;
      if ('targetAmount' in patch) payload.target_amount = patch.targetAmount;
      if ('targetDate' in patch) payload.target_date = patch.targetDate ?? null;
      if ('linkedAccountId' in patch) payload.linked_account_id = patch.linkedAccountId ?? null;
      if ('contributedAmount' in patch) payload.contributed_amount = patch.contributedAmount;
      if ('archivedAt' in patch) payload.archived_at = patch.archivedAt;
      const { data, error } = await supabase
        .from('budget_savings_goals')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapSavingsGoal(data as SavingsGoalRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savingsKey(user?.id) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_savings_goals')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: savingsKey(user?.id) }),
  });

  // A contribution bumps contributed_amount and, when an account is linked,
  // logs a transfer transaction into that account.
  const contributeMutation = useMutation({
    mutationFn: async ({ goal, amount }: { goal: SavingsGoal; amount: number }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_savings_goals')
        .update({ contributed_amount: goal.contributedAmount + amount })
        .eq('id', goal.id)
        .eq('user_id', user.id);
      if (error) throw error;

      if (goal.linkedAccountId) {
        const { error: txnError } = await supabase.from('budget_transactions').insert({
          user_id: user.id,
          account_id: goal.linkedAccountId,
          amount,
          date: new Date().toISOString().slice(0, 10),
          type: 'credit',
          note: `Savings: ${goal.name}`,
        });
        if (txnError) throw txnError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: savingsKey(user?.id) });
      qc.invalidateQueries({ queryKey: transactionsKey(user?.id) });
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
    },
  });

  const all = query.data ?? [];
  const active = useMemo(() => all.filter((goal) => !goal.archivedAt), [all]);

  return {
    savingsGoals: active,
    allSavingsGoals: all,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    createSavingsGoal: (input: NewSavingsGoalInput) => createMutation.mutateAsync(input),
    updateSavingsGoal: (id: string, patch: Partial<SavingsGoal>) =>
      updateMutation.mutateAsync({ id, patch }),
    deleteSavingsGoal: (id: string) => deleteMutation.mutateAsync(id),
    contribute: (goal: SavingsGoal, amount: number) =>
      contributeMutation.mutateAsync({ goal, amount }),
  };
}
