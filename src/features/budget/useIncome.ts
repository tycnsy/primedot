import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { monthKey } from './compute/dates';
import { earnedMonthFromInput } from './compute/earnings';
import { recordEarningsSnapshotsForMonths } from './recordEarningsSnapshot';
import {
  mapIncomeAdjustment,
  mapIncomeEntry,
  type IncomeAdjustment,
  type IncomeAdjustmentRow,
  type IncomeEntry,
  type IncomeEntryRow,
  type NewIncomeInput,
} from './types';
import { earningsSnapshotsKey } from './useEarnings';

const incomeKey = (userId: string | undefined) => ['budget_income', userId] as const;
const adjustmentsKey = (userId: string | undefined) =>
  ['budget_income_adjustments', userId] as const;
const transactionsKey = (userId: string | undefined) =>
  ['budget_transactions', userId] as const;
const accountsKey = (userId: string | undefined) => ['budget_accounts', userId] as const;

function resolveEarnedMonth(input: NewIncomeInput | Partial<IncomeEntry>, fallbackDate?: string): string {
  if ('earnedMonth' in input && input.earnedMonth) {
    return monthKey(input.earnedMonth);
  }
  if (fallbackDate) return monthKey(fallbackDate);
  return monthKey(new Date());
}

export function useIncome() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: incomeKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<IncomeEntry[]> => {
      const { data, error } = await supabase
        .from('budget_income_entries')
        .select('*')
        .order('expected_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as IncomeEntryRow[]).map(mapIncomeEntry);
    },
  });

  const adjustmentsQuery = useQuery({
    queryKey: adjustmentsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<IncomeAdjustment[]> => {
      const { data, error } = await supabase
        .from('budget_income_adjustments')
        .select('*')
        .order('adjusted_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as IncomeAdjustmentRow[]).map(mapIncomeAdjustment);
    },
  });

  const adjustmentsByEntryId = useMemo(() => {
    const map = new Map<string, IncomeAdjustment[]>();
    for (const adjustment of adjustmentsQuery.data ?? []) {
      const list = map.get(adjustment.incomeEntryId) ?? [];
      list.push(adjustment);
      map.set(adjustment.incomeEntryId, list);
    }
    return map;
  }, [adjustmentsQuery.data]);

  const syncSnapshots = async (
    months: string[],
    incomeEntries: IncomeEntry[],
    note?: string,
  ) => {
    if (!user || months.length === 0) return;
    await recordEarningsSnapshotsForMonths(supabase, user.id, months, incomeEntries, note);
    qc.invalidateQueries({ queryKey: earningsSnapshotsKey(user?.id) });
  };

  const createMutation = useMutation({
    mutationFn: async (input: NewIncomeInput) => {
      if (!user) throw new Error('Not signed in');
      const earnedMonth = resolveEarnedMonth(input, input.expectedDate);
      const { data, error } = await supabase
        .from('budget_income_entries')
        .insert({
          user_id: user.id,
          source_name: input.sourceName,
          amount: input.amount,
          expected_date: input.expectedDate,
          earned_month: earnedMonth,
          status: input.status ?? 'expected',
          received_date: input.receivedDate ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return mapIncomeEntry(data as IncomeEntryRow);
    },
    onSuccess: async (created) => {
      const current = qc.getQueryData<IncomeEntry[]>(incomeKey(user?.id)) ?? [];
      const updated = [...current, created].sort((a, b) =>
        a.expectedDate.localeCompare(b.expectedDate),
      );
      qc.setQueryData(incomeKey(user?.id), updated);
      qc.invalidateQueries({ queryKey: adjustmentsKey(user?.id) });
      await syncSnapshots([created.earnedMonth], updated, `Added ${created.sourceName}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
      previous,
    }: {
      id: string;
      patch: Partial<IncomeEntry>;
      previous?: IncomeEntry;
    }) => {
      const payload: Record<string, unknown> = {};
      if ('sourceName' in patch) payload.source_name = patch.sourceName;
      if ('amount' in patch) payload.amount = patch.amount;
      if ('expectedDate' in patch) payload.expected_date = patch.expectedDate;
      if ('earnedMonth' in patch) payload.earned_month = monthKey(patch.earnedMonth!);
      if ('status' in patch) payload.status = patch.status;
      if ('receivedDate' in patch) payload.received_date = patch.receivedDate ?? null;
      const { data, error } = await supabase
        .from('budget_income_entries')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return { entry: mapIncomeEntry(data as IncomeEntryRow), previous };
    },
    onSuccess: async ({ entry, previous }) => {
      const current = qc.getQueryData<IncomeEntry[]>(incomeKey(user?.id)) ?? [];
      const updated = current.map((item) => (item.id === entry.id ? entry : item));
      qc.setQueryData(incomeKey(user?.id), updated);
      qc.invalidateQueries({ queryKey: adjustmentsKey(user?.id) });
      const months = [entry.earnedMonth];
      if (previous && monthKey(previous.earnedMonth) !== monthKey(entry.earnedMonth)) {
        months.push(previous.earnedMonth);
      }
      await syncSnapshots(months, updated, `Updated ${entry.sourceName}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, earnedMonth }: { id: string; earnedMonth: string }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_income_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return { id, earnedMonth };
    },
    onSuccess: async ({ id, earnedMonth }) => {
      const current = qc.getQueryData<IncomeEntry[]>(incomeKey(user?.id)) ?? [];
      const updated = current.filter((item) => item.id !== id);
      qc.setQueryData(incomeKey(user?.id), updated);
      qc.invalidateQueries({ queryKey: adjustmentsKey(user?.id) });
      await syncSnapshots([earnedMonth], updated, 'Income deleted');
    },
  });

  const markReceivedMutation = useMutation({
    mutationFn: async ({ entry, accountId }: { entry: IncomeEntry; accountId?: string }) => {
      if (!user) throw new Error('Not signed in');
      const receivedDate = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from('budget_income_entries')
        .update({ status: 'received', received_date: receivedDate })
        .eq('id', entry.id)
        .eq('user_id', user.id);
      if (error) throw error;

      if (accountId) {
        const { error: txnError } = await supabase.from('budget_transactions').insert({
          user_id: user.id,
          account_id: accountId,
          amount: entry.amount,
          date: receivedDate,
          type: 'credit',
          note: `Income: ${entry.sourceName}`,
        });
        if (txnError) throw txnError;
      }

      return { entry, receivedDate };
    },
    onSuccess: async ({ entry, receivedDate }) => {
      const current = qc.getQueryData<IncomeEntry[]>(incomeKey(user?.id)) ?? [];
      const updated = current.map((item) =>
        item.id === entry.id
          ? { ...item, status: 'received' as const, receivedDate }
          : item,
      );
      qc.setQueryData(incomeKey(user?.id), updated);
      qc.invalidateQueries({ queryKey: adjustmentsKey(user?.id) });
      await syncSnapshots([entry.earnedMonth], updated, `Marked ${entry.sourceName} received`);
      qc.invalidateQueries({ queryKey: transactionsKey(user?.id) });
      qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
    },
  });

  return {
    incomeEntries: query.data ?? [],
    incomeAdjustments: adjustmentsQuery.data ?? [],
    adjustmentsByEntryId,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    addIncome: (input: NewIncomeInput) => createMutation.mutateAsync(input),
    updateIncome: (id: string, patch: Partial<IncomeEntry>, previous?: IncomeEntry) =>
      updateMutation.mutateAsync({ id, patch, previous }),
    deleteIncome: (id: string, earnedMonth: string) =>
      deleteMutation.mutateAsync({ id, earnedMonth }),
    markReceived: (entry: IncomeEntry, accountId?: string) =>
      markReceivedMutation.mutateAsync({ entry, accountId }),
    earnedMonthFromInput,
  };
}

export { incomeKey as budgetIncomeKey };
