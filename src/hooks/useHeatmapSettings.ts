import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { HeatmapSettings } from '../lib/types';

const heatmapSettingsKey = (userId: string | undefined) =>
  ['heatmap_settings', userId] as const;

export function useHeatmapSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: heatmapSettingsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<HeatmapSettings | null> => {
      const { data, error } = await supabase
        .from('heatmap_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as HeatmapSettings | null) ?? null;
    },
  });
}

export function useUpsertHeatmapSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ yearlyStartDate }: { yearlyStartDate: string | null }) => {
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('heatmap_settings')
        .upsert(
          {
            user_id: user.id,
            yearly_start_date: yearlyStartDate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as HeatmapSettings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: heatmapSettingsKey(user?.id) });
    },
  });
}
