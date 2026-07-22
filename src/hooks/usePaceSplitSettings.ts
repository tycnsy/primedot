import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { PaceSplitSettings } from '../lib/types';

const paceSplitSettingsKey = (userId: string | undefined) =>
  ['pace_split_settings', userId] as const;

export function usePaceSplitSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: paceSplitSettingsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<PaceSplitSettings | null> => {
      const { data, error } = await supabase
        .from('pace_split_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as PaceSplitSettings | null) ?? null;
    },
  });
}

export function useUpsertPaceSplitSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      paceSplitPercentage,
      paceMarginLimitSeconds,
    }: {
      paceSplitPercentage: number;
      /** NULL = unlimited (off). Clamped to >= 0 when set. */
      paceMarginLimitSeconds: number | null;
    }) => {
      if (!user) throw new Error('Not signed in');

      const clamped = Math.min(100, Math.max(0, paceSplitPercentage));
      const marginLimit =
        paceMarginLimitSeconds == null || !Number.isFinite(paceMarginLimitSeconds)
          ? null
          : Math.max(0, Math.round(paceMarginLimitSeconds));

      const { data, error } = await supabase
        .from('pace_split_settings')
        .upsert(
          {
            user_id: user.id,
            pace_split_percentage: clamped,
            pace_margin_limit_seconds: marginLimit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as PaceSplitSettings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paceSplitSettingsKey(user?.id) });
    },
  });
}
