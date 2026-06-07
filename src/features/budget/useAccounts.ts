import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  mapAccount,
  type Account,
  type AccountRow,
  type NewAccountInput,
} from './types';
import { isoDate } from './compute/dates';

const accountsKey = (userId: string | undefined) => ['budget_accounts', userId] as const;
const transactionsKey = (userId: string | undefined) =>
  ['budget_transactions', userId] as const;

function toAccountInsert(userId: string, input: NewAccountInput, sortOrder: number) {
  const isCredit = input.type === 'credit';
  return {
    user_id: userId,
    name: input.name,
    type: input.type,
    credit_limit: isCredit ? input.creditLimit ?? null : null,
    apr: isCredit ? input.apr ?? null : null,
    minimum_payment: isCredit ? input.minimumPayment ?? null : null,
    payoff_target_date: isCredit ? input.payoffTargetDate ?? null : null,
    sort_order: sortOrder,
  };
}

export function useAccounts() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: accountsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('budget_accounts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as AccountRow[]).map(mapAccount);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: NewAccountInput) => {
      if (!user) throw new Error('Not signed in');
      const current = qc.getQueryData<Account[]>(accountsKey(user.id)) ?? [];
      const { data, error } = await supabase
        .from('budget_accounts')
        .insert(toAccountInsert(user.id, input, current.length))
        .select('*')
        .single();
      if (error) throw error;
      const account = mapAccount(data as AccountRow);

      // Log the opening balance as an adjustment so balances stay derived.
      if (typeof input.openingBalance === 'number' && input.openingBalance !== 0) {
        const { error: txnError } = await supabase.from('budget_transactions').insert({
          user_id: user.id,
          account_id: account.id,
          amount: input.openingBalance,
          date: isoDate(new Date()),
          type: 'adjustment',
          note: 'Opening balance',
        });
        if (txnError) throw txnError;
      }
      return account;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
      qc.invalidateQueries({ queryKey: transactionsKey(user?.id) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Account> }) => {
      const payload: Record<string, unknown> = {};
      if ('name' in patch) payload.name = patch.name;
      if ('type' in patch) payload.type = patch.type;
      if ('creditLimit' in patch) payload.credit_limit = patch.creditLimit ?? null;
      if ('apr' in patch) payload.apr = patch.apr ?? null;
      if ('minimumPayment' in patch) payload.minimum_payment = patch.minimumPayment ?? null;
      if ('payoffTargetDate' in patch)
        payload.payoff_target_date = patch.payoffTargetDate ?? null;
      if ('sortOrder' in patch) payload.sort_order = patch.sortOrder;
      if ('archivedAt' in patch) payload.archived_at = patch.archivedAt;
      const { data, error } = await supabase
        .from('budget_accounts')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapAccount(data as AccountRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('budget_accounts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!user) throw new Error('Not signed in');
      for (let index = 0; index < orderedIds.length; index += 1) {
        const { error } = await supabase
          .from('budget_accounts')
          .update({ sort_order: index })
          .eq('id', orderedIds[index])
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
    },
  });

  const all = accountsQuery.data ?? [];
  const active = useMemo(() => all.filter((account) => !account.archivedAt), [all]);
  const archived = useMemo(() => all.filter((account) => !!account.archivedAt), [all]);

  return {
    accounts: active,
    archivedAccounts: archived,
    allAccounts: all,
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error as Error | null,
    createAccount: (input: NewAccountInput) => createMutation.mutateAsync(input),
    updateAccount: (id: string, patch: Partial<Account>) =>
      updateMutation.mutateAsync({ id, patch }),
    archiveAccount: (id: string) => archiveMutation.mutateAsync(id),
    reorderAccounts: (ids: string[]) => reorderMutation.mutateAsync(ids),
  };
}
