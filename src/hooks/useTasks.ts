import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Task, TaskInput } from '../lib/types';

const tasksKey = (projectId: string | undefined) =>
  ['tasks', projectId] as const;
const tasksManyKey = (projectIds: string[]) =>
  ['tasks', 'many', ...projectIds] as const;
const PROJECT_IDS_CHUNK_SIZE = 50;
type TaskStatusDraft = Pick<
  Task,
  | 'type'
  | 'current_progress'
  | 'scaling_modifier'
  | 'scripting_modifier'
  | 'script_length'
  | 'unit_count'
  | 'unit_length'
  | 'manual_length'
>;

function isMissingTaskSortOrderColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message ?? '') : '';
  const details = 'details' in error ? String(error.details ?? '') : '';
  const hint = 'hint' in error ? String(error.hint ?? '') : '';
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return combined.includes('sort_order') && combined.includes('column');
}

function upsertTask(tasks: Task[] | undefined, task: Task): Task[] {
  if (!tasks) return [task];
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) return [...tasks, task];
  const next = [...tasks];
  next[idx] = task;
  return next;
}

async function fetchProjectVideoLength(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from('projects')
    .select('video_length')
    .eq('id', projectId)
    .single();
  if (error) throw error;
  return typeof data?.video_length === 'number' ? data.video_length : 0;
}

function deriveStatusFromDraft(
  draft: TaskStatusDraft,
  projectVideoLength: number,
): Task['status'] {
  const current = Number.isFinite(draft.current_progress) ? draft.current_progress : 0;
  if (current <= 0) return 'not_started';

  let target = 0;
  switch (draft.type) {
    case 'scaling':
      target = Number.isFinite(projectVideoLength) ? projectVideoLength : 0;
      break;
    case 'scripting':
      target =
        typeof draft.script_length === 'number' &&
        Number.isFinite(draft.script_length)
          ? draft.script_length
          : 0;
      break;
    case 'manual':
      target =
        typeof draft.manual_length === 'number' &&
        Number.isFinite(draft.manual_length)
          ? draft.manual_length
          : 0;
      break;
    case 'custom':
      target =
        typeof draft.unit_count === 'number' && Number.isFinite(draft.unit_count)
          ? draft.unit_count
          : 0;
      break;
  }

  if (target > 0 && current >= target) return 'complete';
  return 'in_progress';
}

export function useTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: tasksKey(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (!error) return (data ?? []) as Task[];

      if (!isMissingTaskSortOrderColumn(error)) throw error;

      const fallback = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: true });
      if (fallback.error) throw fallback.error;
      return ((fallback.data ?? []) as Task[]).map((task, index) => ({
        ...task,
        sort_order: index,
      }));
    },
  });
}

export function useTasksForProjects(projectIds: string[]) {
  return useQuery({
    queryKey: tasksManyKey(projectIds),
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Task[]> => {
      const rows: Task[] = [];

      for (let i = 0; i < projectIds.length; i += PROJECT_IDS_CHUNK_SIZE) {
        const projectIdsChunk = projectIds.slice(i, i + PROJECT_IDS_CHUNK_SIZE);
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .in('project_id', projectIdsChunk)
          .order('project_id', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (!error) {
          rows.push(...((data ?? []) as Task[]));
          continue;
        }
        if (!isMissingTaskSortOrderColumn(error)) throw error;

        const fallback = await supabase
          .from('tasks')
          .select('*')
          .in('project_id', projectIdsChunk)
          .order('project_id', { ascending: true })
          .order('created_at', { ascending: true });
        if (fallback.error) throw fallback.error;

        const counters = new Map<string, number>();
        const normalized = ((fallback.data ?? []) as Task[]).map((task) => {
          const next = counters.get(task.project_id) ?? 0;
          counters.set(task.project_id, next + 1);
          return { ...task, sort_order: next };
        });
        rows.push(...normalized);
      }

      return rows;
    },
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const projectVideoLength = await fetchProjectVideoLength(projectId);
      const nextStatus = deriveStatusFromDraft(input, projectVideoLength);
      const { data: lastTask, error: lastTaskError } = await supabase
        .from('tasks')
        .select('sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const isLegacyDb = isMissingTaskSortOrderColumn(lastTaskError);
      if (lastTaskError && !isLegacyDb) throw lastTaskError;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...input,
          status: nextStatus,
          ...(isLegacyDb ? {} : { sort_order: (lastTask?.sort_order ?? -1) + 1 }),
        })
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(tasksKey(projectId), (prev) => upsertTask(prev, task));
      qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'many'] }, (prev) =>
        upsertTask(prev, task),
      );
    },
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data: existingTask, error: existingTaskError } = await supabase
        .from('tasks')
        .select(
          'project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length',
        )
        .eq('id', id)
        .single();
      if (existingTaskError) throw existingTaskError;

      const mergedDraft = {
        ...(existingTask as TaskStatusDraft),
        ...patch,
      } as TaskStatusDraft;
      const projectVideoLength = await fetchProjectVideoLength(projectId);
      const nextStatus = deriveStatusFromDraft(mergedDraft, projectVideoLength);

      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, status: nextStatus })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(tasksKey(projectId), (prev) => upsertTask(prev, task));
      qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'many'] }, (prev) =>
        upsertTask(prev, task),
      );
    },
  });
}

export function useUpdateAnyTask(projectIds: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data: existingTask, error: existingTaskError } = await supabase
        .from('tasks')
        .select(
          'project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length',
        )
        .eq('id', id)
        .single();
      if (existingTaskError) throw existingTaskError;

      const mergedDraft = {
        ...(existingTask as TaskStatusDraft),
        ...patch,
      } as TaskStatusDraft;
      const projectVideoLength = await fetchProjectVideoLength(existingTask.project_id);
      const nextStatus = deriveStatusFromDraft(mergedDraft, projectVideoLength);

      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, status: nextStatus })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: tasksKey(task.project_id) });
      qc.invalidateQueries({ queryKey: tasksManyKey(projectIds) });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<Task[]>(
        tasksKey(projectId),
        (prev) => prev?.filter((task) => task.id !== id) ?? [],
      );
      qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'many'] }, (prev) =>
        prev?.filter((task) => task.id !== id) ?? [],
      );
    },
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      const updates = await Promise.all(
        taskIds.map((id, index) =>
          supabase
            .from('tasks')
            .update({ sort_order: index })
            .eq('id', id)
            .select('id')
            .single(),
        ),
      );

      const firstError = updates.find((result) => result.error)?.error;
      if (firstError && isMissingTaskSortOrderColumn(firstError)) return taskIds;
      if (firstError) throw firstError;
      return taskIds;
    },
    onMutate: async (taskIds) => {
      await qc.cancelQueries({ queryKey: tasksKey(projectId) });
      const previous = qc.getQueryData<Task[]>(tasksKey(projectId));

      if (previous) {
        const byId = new Map(previous.map((task) => [task.id, task]));
        const next = taskIds
          .map((id, index) => {
            const task = byId.get(id);
            if (!task) return null;
            return { ...task, sort_order: index };
          })
          .filter((task): task is Task => !!task);
        qc.setQueryData(tasksKey(projectId), next);
      }

      return { previous };
    },
    onError: (_err, _taskIds, context) => {
      if (context?.previous) {
        qc.setQueryData(tasksKey(projectId), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
    },
  });
}
