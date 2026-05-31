import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paceRefreshQueryOptions } from './paceRefresh';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  PaceSettings,
  Project,
  ProjectInput,
  ProjectSeries,
  ProjectTag,
  ProjectUpdateInput,
} from '../lib/types';

const projectsKey = (userId: string | undefined) =>
  ['projects', userId] as const;
const archivedProjectsKey = (userId: string | undefined) =>
  ['projects', 'archived', userId] as const;
const allProjectsKey = (userId: string | undefined) =>
  ['projects', 'all', userId] as const;
const projectKey = (id: string) => ['project', id] as const;
const projectTagsKey = (userId: string | undefined) =>
  ['project_tags', userId] as const;
const projectSeriesKey = (userId: string | undefined) =>
  ['project_series', userId] as const;
const paceKey = (projectId: string | undefined) =>
  ['pace_settings', projectId] as const;

type ProjectListMode = 'active' | 'archived' | 'all';

function isMissingSortOrderColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message ?? '') : '';
  const details = 'details' in error ? String(error.details ?? '') : '';
  const hint = 'hint' in error ? String(error.hint ?? '') : '';
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return combined.includes('sort_order') && combined.includes('column');
}

function normalizeTag(tag: string | null | undefined): string | null {
  if (tag == null) return null;
  const trimmed = tag.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSeries(series: string | null | undefined): string | null {
  if (series == null) return null;
  const trimmed = series.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureProjectTag(userId: string, tag: string | null): Promise<void> {
  if (!tag) return;
  const { error } = await supabase
    .from('project_tags')
    .upsert({ user_id: userId, name: tag }, { onConflict: 'user_id,name' });
  if (error) throw error;
}

async function ensureProjectSeries(userId: string, series: string | null): Promise<void> {
  if (!series) return;
  const { error } = await supabase
    .from('project_series')
    .upsert({ user_id: userId, name: series }, { onConflict: 'user_id,name' });
  if (error) throw error;
}

async function getPaceSettings(projectId: string): Promise<PaceSettings | null> {
  const { data, error } = await supabase
    .from('pace_settings')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PaceSettings | null;
}

async function syncTrueDeadlineWithDueDate(
  projectId: string,
  dueDate: string | null,
): Promise<PaceSettings | null> {
  const existing = await getPaceSettings(projectId);
  if (!dueDate) {
    if (!existing) return null;
    const { error } = await supabase.from('pace_settings').delete().eq('id', existing.id);
    if (error) throw error;
    return null;
  }

  if (existing) {
    const { data, error } = await supabase
      .from('pace_settings')
      .update({ true_deadline: dueDate })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as PaceSettings;
  }

  const { data, error } = await supabase
    .from('pace_settings')
    .insert({
      project_id: projectId,
      target_deadline: dueDate,
      true_deadline: dueDate,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PaceSettings;
}

async function fetchProjects(mode: ProjectListMode): Promise<Project[]> {
  let request = supabase
    .from('projects')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (mode === 'active') {
    request = request.is('archived_at', null);
  } else if (mode === 'archived') {
    request = request
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
  }
  const { data, error } = await request;

  if (!error) return (data ?? []) as Project[];

  if (!isMissingSortOrderColumn(error)) throw error;

  let fallback = supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (mode === 'active') {
    fallback = fallback.is('archived_at', null);
  } else if (mode === 'archived') {
    fallback = fallback
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
  }
  const fallbackResult = await fallback;
  if (fallbackResult.error) throw fallbackResult.error;

  return ((fallbackResult.data ?? []) as Project[]).map((project, index) => ({
    ...project,
    sort_order: index,
  }));
}

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: projectsKey(user?.id),
    enabled: !!user,
    ...paceRefreshQueryOptions,
    queryFn: async (): Promise<Project[]> => fetchProjects('active'),
  });
}

export function useArchivedProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: archivedProjectsKey(user?.id),
    enabled: !!user,
    ...paceRefreshQueryOptions,
    queryFn: async (): Promise<Project[]> => fetchProjects('archived'),
  });
}

export function useAllProjectsIncludingArchived() {
  const { user } = useAuth();
  return useQuery({
    queryKey: allProjectsKey(user?.id),
    enabled: !!user,
    ...paceRefreshQueryOptions,
    queryFn: async (): Promise<Project[]> => fetchProjects('all'),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKey(id ?? ''),
    enabled: !!id,
    ...paceRefreshQueryOptions,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Project | null;
    },
  });
}

export function useProjectTags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: projectTagsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectTag[]> => {
      const { data, error } = await supabase
        .from('project_tags')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectTag[];
    },
  });
}

export function useProjectSeries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: projectSeriesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectSeries[]> => {
      const { data, error } = await supabase
        .from('project_series')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectSeries[];
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      if (!user) throw new Error('Not signed in');
      const tag = normalizeTag(input.tag);
      const series = normalizeSeries(input.series);
      await ensureProjectTag(user.id, tag);
      await ensureProjectSeries(user.id, series);
      const { data: lastProject, error: lastProjectError } = await supabase
        .from('projects')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const isLegacyDb = isMissingSortOrderColumn(lastProjectError);
      if (lastProjectError && !isLegacyDb) throw lastProjectError;

      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...input,
          sync_true_deadline_with_due_date:
            input.sync_true_deadline_with_due_date ?? true,
          tag,
          series,
          user_id: user.id,
          ...(isLegacyDb ? {} : { sort_order: (lastProject?.sort_order ?? -1) + 1 }),
        })
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ProjectUpdateInput;
    }) => {
      const normalizedPatch = {
        ...patch,
        ...(patch.tag === undefined ? {} : { tag: normalizeTag(patch.tag) }),
        ...(patch.series === undefined
          ? {}
          : { series: normalizeSeries(patch.series) }),
      };
      if (!user) throw new Error('Not signed in');
      await ensureProjectTag(user.id, normalizedPatch.tag ?? null);
      await ensureProjectSeries(user.id, normalizedPatch.series ?? null);
      const { data, error } = await supabase
        .from('projects')
        .update(normalizedPatch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const project = data as Project;
      const dueDateProvided = Object.prototype.hasOwnProperty.call(
        normalizedPatch,
        'due_date',
      );
      const syncToggleEnabled = normalizedPatch.sync_true_deadline_with_due_date === true;
      const shouldSyncTrueDeadline =
        project.sync_true_deadline_with_due_date && (dueDateProvided || syncToggleEnabled);
      const syncedPace = shouldSyncTrueDeadline
        ? await syncTrueDeadlineWithDueDate(project.id, project.due_date)
        : undefined;
      return { project, syncedPace };
    },
    onSuccess: ({ project, syncedPace }) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectKey(project.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
      if (syncedPace === undefined) return;
      if (syncedPace) {
        qc.setQueryData<PaceSettings | null>(paceKey(project.id), syncedPace);
        qc.setQueriesData<Record<string, PaceSettings>>(
          { queryKey: ['pace_settings', 'many'] },
          (prev) => ({ ...(prev ?? {}), [project.id]: syncedPace }),
        );
        return;
      }
      qc.setQueryData<PaceSettings | null>(paceKey(project.id), null);
      qc.setQueriesData<Record<string, PaceSettings>>(
        { queryKey: ['pace_settings', 'many'] },
        (prev) => {
          if (!prev || !prev[project.id]) return prev ?? {};
          const next = { ...prev };
          delete next[project.id];
          return next;
        },
      );
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const archivedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('projects')
        .update({ archived_at: archivedAt })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectKey(project.id) });
    },
  });
}

export function useRestoreProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('projects')
        .update({ archived_at: null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectKey(project.id) });
    },
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (projectIds: string[]) => {
      const updates = await Promise.all(
        projectIds.map((id, index) =>
          supabase
            .from('projects')
            .update({ sort_order: index })
            .eq('id', id)
            .select('id')
            .single(),
        ),
      );

      const firstError = updates.find((result) => result.error)?.error;
      if (firstError && isMissingSortOrderColumn(firstError)) return projectIds;
      if (firstError) throw firstError;

      return projectIds;
    },
    onMutate: async (projectIds) => {
      await qc.cancelQueries({ queryKey: projectsKey(user?.id) });
      const previous = qc.getQueryData<Project[]>(projectsKey(user?.id));

      if (previous) {
        const byId = new Map(previous.map((project) => [project.id, project]));
        const next = projectIds
          .map((id, index) => {
            const project = byId.get(id);
            if (!project) return null;
            return { ...project, sort_order: index };
          })
          .filter((project): project is Project => !!project);
        qc.setQueryData(projectsKey(user?.id), next);
      }

      return { previous };
    },
    onError: (_err, _projectIds, context) => {
      if (context?.previous) {
        qc.setQueryData(projectsKey(user?.id), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
    },
  });
}

export function useCreateProjectTag() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      color,
    }: {
      name: string;
      color: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');
      const trimmedColor = color.trim();
      if (!trimmedColor) throw new Error('Color is required.');
      const { data, error } = await supabase
        .from('project_tags')
        .insert({ user_id: user.id, name: trimmedName, color: trimmedColor })
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectTag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
    },
  });
}

export function useUpdateProjectTag() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      oldName,
      name,
      color,
    }: {
      id: string;
      oldName: string;
      name: string;
      color: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');
      const trimmedColor = color.trim();
      if (!trimmedColor) throw new Error('Color is required.');

      const { data, error } = await supabase
        .from('project_tags')
        .update({ name: trimmedName, color: trimmedColor })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      if (error) throw error;

      if (oldName !== trimmedName) {
        const { error: renameError } = await supabase
          .from('projects')
          .update({ tag: trimmedName })
          .eq('user_id', user.id)
          .eq('tag', oldName);
        if (renameError) throw renameError;
      }

      return data as ProjectTag;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
    },
  });
}

export function useDeleteProjectTag() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!user) throw new Error('Not signed in');
      const { error: clearError } = await supabase
        .from('projects')
        .update({ tag: null })
        .eq('user_id', user.id)
        .eq('tag', name);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from('project_tags')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
    },
  });
}

export function useCreateProjectSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      color,
    }: {
      name: string;
      color: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');
      const trimmedColor = color.trim();
      if (!trimmedColor) throw new Error('Color is required.');
      const { data, error } = await supabase
        .from('project_series')
        .insert({ user_id: user.id, name: trimmedName, color: trimmedColor })
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectSeries;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useUpdateProjectSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      oldName,
      name,
      color,
    }: {
      id: string;
      oldName: string;
      name: string;
      color: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');
      const trimmedColor = color.trim();
      if (!trimmedColor) throw new Error('Color is required.');

      const { data, error } = await supabase
        .from('project_series')
        .update({ name: trimmedName, color: trimmedColor })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      if (error) throw error;

      if (oldName !== trimmedName) {
        const { error: renameError } = await supabase
          .from('projects')
          .update({ series: trimmedName })
          .eq('user_id', user.id)
          .eq('series', oldName);
        if (renameError) throw renameError;
      }

      return data as ProjectSeries;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
    },
  });
}

export function useDeleteProjectSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!user) throw new Error('Not signed in');
      const { error: clearError } = await supabase
        .from('projects')
        .update({ series: null })
        .eq('user_id', user.id)
        .eq('series', name);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from('project_series')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedProjectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: allProjectsKey(user?.id) });
    },
  });
}
