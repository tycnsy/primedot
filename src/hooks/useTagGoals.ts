import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { TagGoal } from '../lib/types';

const tagGoalsKey = (userId: string | undefined) => ['tag_goals', userId] as const;

export function useTagGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: tagGoalsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<TagGoal[]> => {
      const { data, error } = await supabase
        .from('tag_goals')
        .select('*')
        .order('tag_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TagGoal[];
    },
  });
}

export function useUpsertTagGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      tagName,
      dailyGoalSeconds,
    }: {
      tagName: string;
      dailyGoalSeconds: number;
    }) => {
      if (!user) throw new Error('Not signed in');
      const trimmed = tagName.trim();
      if (!trimmed) throw new Error('Tag is required.');
      const seconds = Number.isFinite(dailyGoalSeconds)
        ? Math.max(0, Math.round(dailyGoalSeconds))
        : 0;

      const { data, error } = await supabase
        .from('tag_goals')
        .upsert(
          {
            user_id: user.id,
            tag_name: trimmed,
            daily_goal_seconds: seconds,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,tag_name' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as TagGoal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagGoalsKey(user?.id) });
    },
  });
}

export function useDeleteTagGoal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (tagName: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('tag_goals')
        .delete()
        .eq('user_id', user.id)
        .eq('tag_name', tagName);
      if (error) throw error;
      return tagName;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagGoalsKey(user?.id) });
    },
  });
}
