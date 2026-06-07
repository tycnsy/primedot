import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { archivedAtFromEndMonth, monthKey, previousMonth } from './compute/dates';
import {
  mapCategory,
  type Category,
  type CategoryRow,
  type NewCategoryInput,
} from './types';

const categoriesKey = (userId: string | undefined) => ['budget_categories', userId] as const;

export function useCategories() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: categoriesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('budget_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CategoryRow[]).map(mapCategory);
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({
      input,
      startMonth,
    }: {
      input: NewCategoryInput;
      startMonth?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const current = qc.getQueryData<Category[]>(categoriesKey(user.id)) ?? [];
      const effectiveStart = input.startMonth ?? startMonth;
      const payload: Record<string, unknown> = {
        user_id: user.id,
        name: input.name,
        budget_type: input.budgetType,
        budget_value: input.budgetValue,
        is_fixed: input.isFixed ?? input.budgetType === 'flat',
        sort_order: current.length,
      };
      if (effectiveStart) {
        payload.created_at = `${monthKey(effectiveStart)}T00:00:00.000Z`;
      }
      if (input.endMonth) {
        payload.archived_at = archivedAtFromEndMonth(input.endMonth);
      }
      const { data, error } = await supabase
        .from('budget_categories')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return mapCategory(data as CategoryRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(user?.id) }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Category> }) => {
      const payload: Record<string, unknown> = {};
      if ('name' in patch) payload.name = patch.name;
      if ('budgetType' in patch) payload.budget_type = patch.budgetType;
      if ('budgetValue' in patch) payload.budget_value = patch.budgetValue;
      if ('isFixed' in patch) payload.is_fixed = patch.isFixed;
      if ('sortOrder' in patch) payload.sort_order = patch.sortOrder;
      if ('archivedAt' in patch) payload.archived_at = patch.archivedAt;
      if ('createdAt' in patch) payload.created_at = patch.createdAt;
      const { data, error } = await supabase
        .from('budget_categories')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapCategory(data as CategoryRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(user?.id) }),
  });

  const branchMutation = useMutation({
    mutationFn: async ({
      source,
      fromMonth,
      input,
    }: {
      source: Category;
      fromMonth: string;
      input: NewCategoryInput;
    }) => {
      if (!user) throw new Error('Not signed in');
      const branchMonth = monthKey(fromMonth);
      const { error: archiveError } = await supabase
        .from('budget_categories')
        .update({ archived_at: archivedAtFromEndMonth(previousMonth(branchMonth)) })
        .eq('id', source.id)
        .eq('user_id', user.id);
      if (archiveError) throw archiveError;

      const payload: Record<string, unknown> = {
        user_id: user.id,
        name: input.name,
        budget_type: input.budgetType,
        budget_value: input.budgetValue,
        is_fixed: input.isFixed ?? input.budgetType === 'flat',
        sort_order: source.sortOrder,
        created_at: `${branchMonth}T00:00:00.000Z`,
      };
      if (input.endMonth) {
        payload.archived_at = archivedAtFromEndMonth(input.endMonth);
      }
      const { data, error } = await supabase
        .from('budget_categories')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return mapCategory(data as CategoryRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(user?.id) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, archiveMonth }: { id: string; archiveMonth?: string }) => {
      if (!user) throw new Error('Not signed in');
      const payload = archiveMonth
        ? { archived_at: `${monthKey(archiveMonth)}T00:00:00.000Z` }
        : { archived_at: new Date().toISOString() };
      const { error } = await supabase
        .from('budget_categories')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(user?.id) }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!user) throw new Error('Not signed in');
      for (let index = 0; index < orderedIds.length; index += 1) {
        const { error } = await supabase
          .from('budget_categories')
          .update({ sort_order: index })
          .eq('id', orderedIds[index])
          .eq('user_id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoriesKey(user?.id) }),
  });

  const all = query.data ?? [];
  const active = useMemo(() => all.filter((category) => !category.archivedAt), [all]);

  return {
    categories: active,
    allCategories: all,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    createCategory: (input: NewCategoryInput, startMonth?: string) =>
      createMutation.mutateAsync({ input, startMonth }),
    updateCategory: (id: string, patch: Partial<Category>) =>
      updateMutation.mutateAsync({ id, patch }),
    branchCategory: (source: Category, fromMonth: string, input: NewCategoryInput) =>
      branchMutation.mutateAsync({ source, fromMonth, input }),
    deleteCategory: (id: string, archiveMonth?: string) =>
      deleteMutation.mutateAsync({ id, archiveMonth }),
    reorderCategories: (ids: string[]) => reorderMutation.mutateAsync(ids),
  };
}
