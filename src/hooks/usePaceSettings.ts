import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PaceSettings } from '../lib/types';

const paceKey = (projectId: string | undefined) =>
  ['pace_settings', projectId] as const;
const paceManyKey = (projectIds: string[]) =>
  ['pace_settings', 'many', ...projectIds] as const;

export function usePaceSettings(projectId: string | undefined) {
  return useQuery({
    queryKey: paceKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<PaceSettings | null> => {
      const { data, error } = await supabase
        .from('pace_settings')
        .select('*')
        .eq('project_id', projectId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PaceSettings | null;
    },
  });
}

export function usePaceSettingsForProjects(projectIds: string[]) {
  return useQuery({
    queryKey: paceManyKey(projectIds),
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Record<string, PaceSettings>> => {
      const { data, error } = await supabase
        .from('pace_settings')
        .select('*')
        .in('project_id', projectIds);
      if (error) throw error;

      return ((data ?? []) as PaceSettings[]).reduce<Record<string, PaceSettings>>(
        (acc, pace) => {
          acc[pace.project_id] = pace;
          return acc;
        },
        {},
      );
    },
  });
}

export function useUpsertPaceSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<Pick<PaceSettings, 'target_deadline' | 'true_deadline'>>,
    ) => {
      const { data: existing } = await supabase
        .from('pace_settings')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('pace_settings')
          .update(patch)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as PaceSettings;
      }

      const insert = {
        project_id: projectId,
        target_deadline:
          patch.target_deadline ?? new Date(Date.now() + 86_400_000).toISOString(),
        true_deadline:
          patch.true_deadline ??
          new Date(Date.now() + 7 * 86_400_000).toISOString(),
      };
      const { data, error } = await supabase
        .from('pace_settings')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data as PaceSettings;
    },
    onSuccess: (pace) => {
      qc.setQueryData<PaceSettings | null>(paceKey(projectId), pace);
      qc.setQueriesData<Record<string, PaceSettings>>(
        { queryKey: ['pace_settings', 'many'] },
        (prev) => ({ ...(prev ?? {}), [pace.project_id]: pace }),
      );
    },
  });
}
