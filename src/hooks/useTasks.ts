import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paceRefreshQueryOptions } from './paceRefresh';
import { supabase } from '../lib/supabase';
import type { ComplexMode, Task, TaskInput } from '../lib/types';

/**
 * Draft shape for a subtask row authored in the Complex Task settings modal.
 * `id` is present only when the user is editing an existing subtask.
 */
export interface ComplexSubtaskDraft {
  id?: string;
  name: string;
  scaling_modifier: number;
}

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
  const code = 'code' in error ? String(error.code ?? '') : '';
  const message = 'message' in error ? String(error.message ?? '') : '';
  const details = 'details' in error ? String(error.details ?? '') : '';
  const hint = 'hint' in error ? String(error.hint ?? '') : '';
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  const mentionsSortOrder = combined.includes('sort_order');
  const hasUndefinedColumnSignal =
    code === '42703' || (combined.includes('column') && combined.includes('does not exist'));
  return mentionsSortOrder && hasUndefinedColumnSignal;
}

function upsertTask(tasks: Task[] | undefined, task: Task): Task[] {
  if (!tasks) return [task];
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) return [...tasks, task];
  const next = [...tasks];
  next[idx] = task;
  return next;
}

function applyProjectTaskOrder(tasks: Task[], taskIds: string[], projectId: string): Task[] {
  const orderById = new Map(taskIds.map((id, index) => [id, index]));
  return [...tasks]
    .map((task) => {
      if (task.project_id !== projectId) return task;
      const nextOrder = orderById.get(task.id);
      if (typeof nextOrder !== 'number') return task;
      return { ...task, sort_order: nextOrder };
    })
    .sort((a, b) => {
      if (a.project_id !== b.project_id) return a.project_id.localeCompare(b.project_id);
      if (a.project_id !== projectId) return 0;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
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

type TaskOrderRow = Pick<Task, 'id' | 'project_id' | 'parent_id' | 'sort_order' | 'created_at'>;

async function fetchProjectTaskOrderRows(projectId: string): Promise<TaskOrderRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id,project_id,parent_id,sort_order,created_at')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskOrderRow[];
}

async function persistTaskSortOrder(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const updates = await Promise.all(
    taskIds.map((id, index) =>
      supabase.from('tasks').update({ sort_order: index }).eq('id', id).select('id').single(),
    ),
  );
  const firstError = updates.find((result) => result.error)?.error;
  if (firstError) throw firstError;
}

function buildGlobalOrderWithSubtasksAfterParent(
  rows: TaskOrderRow[],
  parentId: string,
  orderedSubtaskIds: string[],
): string[] {
  const parentIndex = rows.findIndex((row) => row.id === parentId);
  if (parentIndex < 0) {
    throw new Error('Failed to reorder subtasks: parent task not found.');
  }

  const siblingsRemoved = rows.filter((row) => row.parent_id !== parentId);
  const parentIndexWithoutChildren = siblingsRemoved.findIndex((row) => row.id === parentId);
  if (parentIndexWithoutChildren < 0) {
    throw new Error('Failed to reorder subtasks: parent position not found.');
  }

  const beforeAndParent = siblingsRemoved
    .slice(0, parentIndexWithoutChildren + 1)
    .map((row) => row.id);
  const afterParent = siblingsRemoved
    .slice(parentIndexWithoutChildren + 1)
    .map((row) => row.id);

  return [...beforeAndParent, ...orderedSubtaskIds, ...afterParent];
}

async function normalizeProjectTaskOrderWithParentSubtasks(
  projectId: string,
  parentId: string,
  orderedSubtaskIds: string[],
): Promise<void> {
  const rows = await fetchProjectTaskOrderRows(projectId);
  const taskIds = buildGlobalOrderWithSubtasksAfterParent(rows, parentId, orderedSubtaskIds);
  await persistTaskSortOrder(taskIds);
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
    ...paceRefreshQueryOptions,
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
    ...paceRefreshQueryOptions,
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
      const { data: existingSortOrders, error: sortOrderError } = await supabase
        .from('tasks')
        .select('sort_order')
        .eq('project_id', projectId);
      const isLegacyDb = isMissingTaskSortOrderColumn(sortOrderError);
      if (sortOrderError && !isLegacyDb) throw sortOrderError;

      const nextSortOrder = isLegacyDb
        ? undefined
        : ((existingSortOrders ?? []) as { sort_order: number | null }[]).reduce(
            (max, row) =>
              typeof row.sort_order === 'number' && Number.isFinite(row.sort_order)
                ? Math.max(max, row.sort_order)
                : max,
            -1,
          ) + 1;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...input,
          status: nextStatus,
          ...(typeof nextSortOrder === 'number' ? { sort_order: nextSortOrder } : {}),
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
          'project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length,parent_id,complex_mode',
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

      const isCompressedParent =
        (existingTask as { complex_mode?: ComplexMode | null }).complex_mode ===
        'compressed';
      const progressPatched = Object.prototype.hasOwnProperty.call(
        patch,
        'current_progress',
      );
      if (isCompressedParent && progressPatched) {
        await propagateProgressToSubtasks(id, (data as Task).current_progress, projectVideoLength);
      }

      return data as Task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
      qc.setQueryData<Task[]>(tasksKey(projectId), (prev) => upsertTask(prev, task));
      qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'many'] }, (prev) =>
        upsertTask(prev, task),
      );
    },
  });
}

/**
 * When a compressed complex parent's `current_progress` changes, mirror that
 * value into every subtask so re-expanding starts the subtasks at the same
 * value the parent now shows.
 */
async function propagateProgressToSubtasks(
  parentId: string,
  nextProgress: number,
  projectVideoLength: number,
): Promise<void> {
  const { data: subtasks, error } = await supabase
    .from('tasks')
    .select(
      'id,type,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length',
    )
    .eq('parent_id', parentId);
  if (error) throw error;

  type SubFields = {
    id: string;
    type: Task['type'];
    scaling_modifier: number | null;
    scripting_modifier: number | null;
    script_length: number | null;
    unit_count: number | null;
    unit_length: number | null;
    manual_length: number | null;
  };

  await Promise.all(
    ((subtasks ?? []) as SubFields[]).map((sub) => {
      const draft: TaskStatusDraft = {
        type: sub.type,
        current_progress: nextProgress,
        scaling_modifier: sub.scaling_modifier,
        scripting_modifier: sub.scripting_modifier,
        script_length: sub.script_length,
        unit_count: sub.unit_count,
        unit_length: sub.unit_length,
        manual_length: sub.manual_length,
      };
      const status = deriveStatusFromDraft(draft, projectVideoLength);
      return supabase
        .from('tasks')
        .update({ current_progress: nextProgress, status })
        .eq('id', sub.id);
    }),
  );
}

export function useUpdateAnyTask(projectIds: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data: existingTask, error: existingTaskError } = await supabase
        .from('tasks')
        .select(
          'project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length,parent_id,complex_mode',
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

      const isCompressedParent =
        (existingTask as { complex_mode?: ComplexMode | null }).complex_mode ===
        'compressed';
      const progressPatched = Object.prototype.hasOwnProperty.call(
        patch,
        'current_progress',
      );
      if (isCompressedParent && progressPatched) {
        await propagateProgressToSubtasks(id, (data as Task).current_progress, projectVideoLength);
      }

      return data as Task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: tasksKey(task.project_id) });
      qc.invalidateQueries({ queryKey: tasksManyKey(projectIds) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
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

/**
 * Toggle a complex parent between Compressed and Expanded modes.
 *
 * - expand(parentId): sets complex_mode='expanded' and writes the parent's
 *   current_progress to every subtask so all subtasks resume at that value.
 * - compress(parentId, chosenProgress): sets complex_mode='compressed' and
 *   writes `chosenProgress` to both the parent and every subtask so the
 *   compressed view and persisted subtasks agree.
 */
export function useToggleComplexMode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parentId,
      mode,
      chosenProgress,
    }: {
      parentId: string;
      mode: ComplexMode;
      chosenProgress?: number;
    }) => {
      const projectVideoLength = await fetchProjectVideoLength(projectId);

      if (mode === 'expanded') {
        const { data: parent, error: parentError } = await supabase
          .from('tasks')
          .select('current_progress')
          .eq('id', parentId)
          .single();
        if (parentError) throw parentError;
        const startProgress = (parent as { current_progress: number }).current_progress;

        await propagateProgressToSubtasks(parentId, startProgress, projectVideoLength);

        const { data, error } = await supabase
          .from('tasks')
          .update({ complex_mode: 'expanded' })
          .eq('id', parentId)
          .select()
          .single();
        if (error) throw error;
        return data as Task;
      }

      const next =
        typeof chosenProgress === 'number' && Number.isFinite(chosenProgress)
          ? chosenProgress
          : 0;

      const parentStatus = deriveStatusFromDraft(
        {
          type: 'scaling',
          current_progress: next,
          scaling_modifier: 1,
          scripting_modifier: null,
          script_length: null,
          unit_count: null,
          unit_length: null,
          manual_length: null,
        } as TaskStatusDraft,
        projectVideoLength,
      );

      await propagateProgressToSubtasks(parentId, next, projectVideoLength);

      const { data, error } = await supabase
        .from('tasks')
        .update({
          complex_mode: 'compressed',
          current_progress: next,
          status: parentStatus,
        })
        .eq('id', parentId)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
    },
  });
}

/**
 * Convert an existing regular scaling task into a complex parent, creating
 * the supplied subtasks. The task starts in EXPANDED mode and each subtask
 * inherits the parent's current_progress.
 */
export function useConvertToComplex(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parent,
      subtasks,
    }: {
      parent: Task;
      subtasks: ComplexSubtaskDraft[];
    }) => {
      if (parent.type !== 'scaling') {
        throw new Error('Only scaling tasks can become complex tasks.');
      }
      if (subtasks.length < 2) {
        throw new Error('A complex task needs at least 2 subtasks.');
      }
      const projectVideoLength = await fetchProjectVideoLength(projectId);

      const rows = subtasks.map((sub) => {
        const draft: TaskStatusDraft = {
          type: 'scaling',
          current_progress: parent.current_progress,
          scaling_modifier: sub.scaling_modifier,
          scripting_modifier: null,
          script_length: null,
          unit_count: null,
          unit_length: null,
          manual_length: null,
        };
        return {
          project_id: projectId,
          name: sub.name,
          type: 'scaling' as const,
          status: deriveStatusFromDraft(draft, projectVideoLength),
          current_progress: parent.current_progress,
          scaling_modifier: sub.scaling_modifier,
          parent_id: parent.id,
          sort_order: 0,
        };
      });

      const { data: insertedSubtasks, error: insertError } = await supabase
        .from('tasks')
        .insert(rows)
        .select('id')
        .returns<{ id: string }[]>();
      if (insertError) throw insertError;

      const { data: updated, error: updateError } = await supabase
        .from('tasks')
        .update({ complex_mode: 'expanded' })
        .eq('id', parent.id)
        .select()
        .single();
      if (updateError) throw updateError;

      await normalizeProjectTaskOrderWithParentSubtasks(
        projectId,
        parent.id,
        (insertedSubtasks ?? []).map((row) => row.id),
      );

      return updated as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
    },
  });
}

/**
 * Save edits to a complex parent's subtask list. Adds new rows (no `id`),
 * updates existing rows by id, and deletes any subtasks not present in the
 * provided drafts. Minimum 2 subtasks is enforced by the caller.
 */
export function useSaveComplexSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      parent,
      subtasks,
    }: {
      parent: Task;
      subtasks: ComplexSubtaskDraft[];
    }) => {
      if (subtasks.length < 2) {
        throw new Error('A complex task needs at least 2 subtasks.');
      }

      const projectVideoLength = await fetchProjectVideoLength(projectId);

      const { data: existingSubtasks, error: existingError } = await supabase
        .from('tasks')
        .select('id,current_progress')
        .eq('parent_id', parent.id);
      if (existingError) throw existingError;

      const existingById = new Map(
        ((existingSubtasks ?? []) as { id: string; current_progress: number }[]).map((s) => [
          s.id,
          s,
        ]),
      );
      const keepIds = new Set(
        subtasks.map((s) => s.id).filter((id): id is string => !!id),
      );
      const toDelete = (existingSubtasks ?? [])
        .map((s) => (s as { id: string }).id)
        .filter((id) => !keepIds.has(id));

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('tasks')
          .delete()
          .in('id', toDelete);
        if (deleteError) throw deleteError;
      }

      const nextSubtaskIds: string[] = [];
      for (const sub of subtasks) {
        if (sub.id && existingById.has(sub.id)) {
          const draft: TaskStatusDraft = {
            type: 'scaling',
            current_progress: existingById.get(sub.id)!.current_progress,
            scaling_modifier: sub.scaling_modifier,
            scripting_modifier: null,
            script_length: null,
            unit_count: null,
            unit_length: null,
            manual_length: null,
          };
          const status = deriveStatusFromDraft(draft, projectVideoLength);
          const { error } = await supabase
            .from('tasks')
            .update({
              name: sub.name,
              scaling_modifier: sub.scaling_modifier,
              status,
            })
            .eq('id', sub.id);
          if (error) throw error;
          nextSubtaskIds.push(sub.id);
          continue;
        }

        const draft: TaskStatusDraft = {
          type: 'scaling',
          current_progress: parent.current_progress,
          scaling_modifier: sub.scaling_modifier,
          scripting_modifier: null,
          script_length: null,
          unit_count: null,
          unit_length: null,
          manual_length: null,
        };
        const status = deriveStatusFromDraft(draft, projectVideoLength);
        const { data: inserted, error } = await supabase
          .from('tasks')
          .insert({
            project_id: projectId,
            name: sub.name,
            type: 'scaling',
            status,
            current_progress: parent.current_progress,
            scaling_modifier: sub.scaling_modifier,
            parent_id: parent.id,
            sort_order: 0,
          })
          .select('id')
          .single();
        if (error) throw error;
        nextSubtaskIds.push((inserted as { id: string }).id);
      }

      await normalizeProjectTaskOrderWithParentSubtasks(projectId, parent.id, nextSubtaskIds);

      return parent.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
    },
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      if (taskIds.length === 0) return taskIds;
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
      if (firstError) throw firstError;
      return taskIds;
    },
    onMutate: async (taskIds) => {
      await qc.cancelQueries({ queryKey: tasksKey(projectId) });
      const previous = qc.getQueryData<Task[]>(tasksKey(projectId));
      const previousMany = qc.getQueriesData<Task[]>({ queryKey: ['tasks', 'many'] });

      if (previous) {
        const next = applyProjectTaskOrder(previous, taskIds, projectId);
        qc.setQueryData(tasksKey(projectId), next);
      }
      qc.setQueriesData<Task[]>({ queryKey: ['tasks', 'many'] }, (prev) =>
        prev ? applyProjectTaskOrder(prev, taskIds, projectId) : prev,
      );

      return { previous, previousMany };
    },
    onError: (_err, _taskIds, context) => {
      if (context?.previous) {
        qc.setQueryData(tasksKey(projectId), context.previous);
      }
      for (const [queryKey, data] of context?.previousMany ?? []) {
        qc.setQueryData(queryKey, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: tasksKey(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'many'] });
    },
  });
}
