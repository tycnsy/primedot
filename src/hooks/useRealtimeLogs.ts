import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { RealtimeLog, RealtimeLogUpdateInput } from '../lib/types';

const realtimeLogsKey = (
  userId: string | undefined,
  projectId: string | undefined,
  limit: number | undefined,
  since: string | undefined,
  until: string | undefined,
) =>
  [
    'realtime_logs',
    userId,
    projectId ?? 'all',
    limit ?? 'all',
    since ?? 'all',
    until ?? 'all',
  ] as const;

export interface UseRealtimeLogsOptions {
  projectId?: string;
  /** Max rows (newest first). Omit for unbounded queries (use with `since`). */
  limit?: number;
  /** ISO timestamp — only logs on or after this instant. */
  since?: string;
  /** ISO timestamp — only logs on or before this instant. */
  until?: string;
}

export function useRealtimeLogs({
  projectId,
  limit,
  since,
  until,
}: UseRealtimeLogsOptions = {}) {
  const { user } = useAuth();
  const effectiveLimit = limit ?? (since ? undefined : 250);

  return useQuery({
    queryKey: realtimeLogsKey(user?.id, projectId, effectiveLimit, since, until),
    enabled: !!user && (projectId === undefined || projectId.length > 0),
    queryFn: async (): Promise<RealtimeLog[]> => {
      let request = supabase
        .from('realtime_logs')
        .select('*')
        .order('logged_at', { ascending: false });

      if (projectId) {
        request = request.eq('project_id', projectId);
      }
      if (since) {
        request = request.gte('logged_at', since);
      }
      if (until) {
        request = request.lte('logged_at', until);
      }
      if (typeof effectiveLimit === 'number') {
        request = request.limit(effectiveLimit);
      }

      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as RealtimeLog[];
    },
  });
}

export function useDeleteRealtimeLog() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('realtime_logs').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['realtime_logs', user?.id] });
    },
  });
}

export function useUpdateRealtimeLog() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: RealtimeLogUpdateInput;
    }) => {
      const { data, error } = await supabase
        .from('realtime_logs')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as RealtimeLog;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['realtime_logs', user?.id] });
    },
  });
}
