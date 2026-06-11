import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  mapTransaction,
  type NewTransactionInput,
  type NewTransferInput,
  type Transaction,
  type TransactionRow,
} from './types';

const transactionsKey = (userId: string | undefined) =>
  ['budget_transactions', userId] as const;
const accountsKey = (userId: string | undefined) => ['budget_accounts', userId] as const;

function toTransactionInsert(userId: string, input: NewTransactionInput) {
  return {
    user_id: userId,
    account_id: input.accountId,
    category_id: input.categoryId ?? null,
    amount: input.amount,
    date: input.date,
    type: input.type,
    reimbursable: input.reimbursable ?? false,
    reimbursement_status:
      input.reimbursementStatus ?? (input.reimbursable ? 'pending' : 'none'),
    budget_only: input.budgetOnly ?? false,
    note: input.note ?? null,
  };
}

export function useTransactions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: transactionsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('budget_transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as TransactionRow[]).map(mapTransaction);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: transactionsKey(user?.id) });
    qc.invalidateQueries({ queryKey: accountsKey(user?.id) });
  };

  const createMutation = useMutation({
    mutationFn: async (input: NewTransactionInput) => {
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('budget_transactions')
        .insert(toTransactionInsert(user.id, input))
        .select('*')
        .single();
      if (error) throw error;
      return mapTransaction(data as TransactionRow);
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Transaction> }) => {
      const payload: Record<string, unknown> = {};
      if ('accountId' in patch) payload.account_id = patch.accountId;
      if ('categoryId' in patch) payload.category_id = patch.categoryId ?? null;
      if ('amount' in patch) payload.amount = patch.amount;
      if ('date' in patch) payload.date = patch.date;
      if ('type' in patch) payload.type = patch.type;
      if ('reimbursable' in patch) payload.reimbursable = patch.reimbursable;
      if ('reimbursementStatus' in patch)
        payload.reimbursement_status = patch.reimbursementStatus;
      if ('budgetOnly' in patch) payload.budget_only = patch.budgetOnly;
      if ('note' in patch) payload.note = patch.note ?? null;
      const { data, error } = await supabase
        .from('budget_transactions')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapTransaction(data as TransactionRow);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const bulkUpdateCategoryMutation = useMutation({
    mutationFn: async ({
      ids,
      categoryId,
    }: {
      ids: string[];
      categoryId: string | null;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('budget_transactions')
        .update({ category_id: categoryId })
        .in('id', ids)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createTransferMutation = useMutation({
    mutationFn: async (input: NewTransferInput) => {
      if (!user) throw new Error('Not signed in');
      if (input.fromAccountId === input.toAccountId) {
        throw new Error('Transfer accounts must differ');
      }
      const groupId = crypto.randomUUID();
      const shared = {
        user_id: user.id,
        amount: input.amount,
        date: input.date,
        type: 'transfer' as const,
        transfer_group_id: groupId,
        reimbursable: false,
        reimbursement_status: 'none' as const,
        budget_only: false,
        note: input.note ?? null,
      };
      const { error } = await supabase.from('budget_transactions').insert([
        { ...shared, account_id: input.fromAccountId, transfer_leg: 'out' },
        { ...shared, account_id: input.toAccountId, transfer_leg: 'in' },
      ]);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateTransferMutation = useMutation({
    mutationFn: async ({
      groupId,
      input,
    }: {
      groupId: string;
      input: NewTransferInput;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (input.fromAccountId === input.toAccountId) {
        throw new Error('Transfer accounts must differ');
      }
      const shared = {
        amount: input.amount,
        date: input.date,
        note: input.note ?? null,
      };
      const { error: sharedError } = await supabase
        .from('budget_transactions')
        .update(shared)
        .eq('transfer_group_id', groupId)
        .eq('user_id', user.id);
      if (sharedError) throw sharedError;

      const { error: outError } = await supabase
        .from('budget_transactions')
        .update({ account_id: input.fromAccountId })
        .eq('transfer_group_id', groupId)
        .eq('transfer_leg', 'out')
        .eq('user_id', user.id);
      if (outError) throw outError;

      const { error: inError } = await supabase
        .from('budget_transactions')
        .update({ account_id: input.toAccountId })
        .eq('transfer_group_id', groupId)
        .eq('transfer_leg', 'in')
        .eq('user_id', user.id);
      if (inError) throw inError;
    },
    onSuccess: invalidate,
  });

  const deleteTransferMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('budget_transactions')
        .delete()
        .eq('transfer_group_id', groupId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Marking a reimbursement received logs an offsetting credit on the same
  // account and links it back to the original via reimbursed_by_id.
  const markReimbursedMutation = useMutation({
    mutationFn: async (original: Transaction) => {
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('budget_transactions')
        .insert({
          user_id: user.id,
          account_id: original.accountId,
          category_id: original.categoryId ?? null,
          amount: original.amount,
          date: new Date().toISOString().slice(0, 10),
          type: 'credit',
          reimbursable: false,
          reimbursement_status: 'none',
          note: `Reimbursement for ${original.note ?? 'transaction'}`,
        })
        .select('*')
        .single();
      if (error) throw error;
      const offsetting = data as TransactionRow;

      const { error: updateError } = await supabase
        .from('budget_transactions')
        .update({ reimbursement_status: 'received', reimbursed_by_id: offsetting.id })
        .eq('id', original.id)
        .eq('user_id', user.id);
      if (updateError) throw updateError;
    },
    onSuccess: invalidate,
  });

  const transactions = query.data ?? [];
  const byAccount = useMemo(() => {
    return transactions.reduce<Record<string, Transaction[]>>((acc, txn) => {
      (acc[txn.accountId] ??= []).push(txn);
      return acc;
    }, {});
  }, [transactions]);

  return {
    transactions,
    transactionsByAccount: byAccount,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    addTransaction: (input: NewTransactionInput) => createMutation.mutateAsync(input),
    updateTransaction: (id: string, patch: Partial<Transaction>) =>
      updateMutation.mutateAsync({ id, patch }),
    deleteTransaction: (id: string) => deleteMutation.mutateAsync(id),
    bulkUpdateCategory: (ids: string[], categoryId: string | null) =>
      bulkUpdateCategoryMutation.mutateAsync({ ids, categoryId }),
    createTransfer: (input: NewTransferInput) => createTransferMutation.mutateAsync(input),
    updateTransfer: (groupId: string, input: NewTransferInput) =>
      updateTransferMutation.mutateAsync({ groupId, input }),
    deleteTransfer: (groupId: string) => deleteTransferMutation.mutateAsync(groupId),
    markReimbursementReceived: (original: Transaction) =>
      markReimbursedMutation.mutateAsync(original),
  };
}
