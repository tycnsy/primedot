import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type NavPreferencesRow = {
  nav_order: unknown;
  nav_hidden: unknown;
};

type NavPreferences = {
  navOrder: string[];
  navHidden: string[];
};

const navPreferencesKey = (userId: string | undefined) =>
  ['nav-preferences', userId] as const;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeOrder(availableIds: string[], storedOrder: string[]): string[] {
  const available = new Set(availableIds);
  const dedupedStored: string[] = [];
  const seen = new Set<string>();

  for (const id of storedOrder) {
    if (!available.has(id) || seen.has(id)) continue;
    dedupedStored.push(id);
    seen.add(id);
  }

  for (const id of availableIds) {
    if (seen.has(id)) continue;
    dedupedStored.push(id);
    seen.add(id);
  }

  return dedupedStored;
}

function normalizeHidden(availableIds: string[], storedHidden: string[]): string[] {
  const available = new Set(availableIds);
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const id of storedHidden) {
    if (!available.has(id) || seen.has(id)) continue;
    deduped.push(id);
    seen.add(id);
  }

  return deduped;
}

function moveId(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids;
  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0) return ids;

  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function useNavPreferences(availableIds: string[]) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: navPreferencesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<NavPreferences> => {
      const { data, error } = await supabase
        .from('nav_preferences')
        .select('nav_order, nav_hidden')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;

      const row = (data ?? { nav_order: [], nav_hidden: [] }) as NavPreferencesRow;
      return {
        navOrder: toStringArray(row.nav_order),
        navHidden: toStringArray(row.nav_hidden),
      };
    },
  });

  const normalized = useMemo(() => {
    const data = query.data ?? { navOrder: [], navHidden: [] };
    const orderedIds = normalizeOrder(availableIds, data.navOrder);
    const hiddenIds = normalizeHidden(availableIds, data.navHidden);
    const hiddenSet = new Set(hiddenIds);
    return {
      orderedIds,
      hiddenIds,
      hiddenSet,
      visibleIds: orderedIds.filter((id) => !hiddenSet.has(id)),
    };
  }, [availableIds, query.data]);

  const persist = useCallback(
    async (next: NavPreferences) => {
      if (!user) return;
      const { error } = await supabase.from('nav_preferences').upsert(
        {
          user_id: user.id,
          nav_order: next.navOrder,
          nav_hidden: next.navHidden,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    [user],
  );

  const applyAndPersist = useCallback(
    async (next: NavPreferences) => {
      const normalizedNext = {
        navOrder: normalizeOrder(availableIds, next.navOrder),
        navHidden: normalizeHidden(availableIds, next.navHidden),
      };
      qc.setQueryData(navPreferencesKey(user?.id), normalizedNext);
      try {
        await persist(normalizedNext);
      } finally {
        if (user) {
          qc.invalidateQueries({ queryKey: navPreferencesKey(user.id) });
        }
      }
    },
    [availableIds, persist, qc, user, user?.id],
  );

  const reorder = useCallback(
    async (fromId: string, toId: string) => {
      const nextOrder = moveId(normalized.orderedIds, fromId, toId);
      if (nextOrder === normalized.orderedIds) return;
      await applyAndPersist({ navOrder: nextOrder, navHidden: normalized.hiddenIds });
    },
    [applyAndPersist, normalized.hiddenIds, normalized.orderedIds],
  );

  const toggleHidden = useCallback(
    async (id: string) => {
      if (!availableIds.includes(id)) return;
      const nextHiddenSet = new Set(normalized.hiddenIds);
      if (nextHiddenSet.has(id)) nextHiddenSet.delete(id);
      else nextHiddenSet.add(id);
      await applyAndPersist({
        navOrder: normalized.orderedIds,
        navHidden: Array.from(nextHiddenSet),
      });
    },
    [applyAndPersist, availableIds, normalized.hiddenIds, normalized.orderedIds],
  );

  return {
    orderedIds: normalized.orderedIds,
    hiddenIds: normalized.hiddenSet,
    visibleIds: normalized.visibleIds,
    hiddenOrderedIds: normalized.orderedIds.filter((id) => normalized.hiddenSet.has(id)),
    isLoading: query.isLoading,
    reorder,
    toggleHidden,
  };
}
