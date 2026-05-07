import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Project, ProjectInput, ProjectTag } from '../lib/types';

const projectsKey = (userId: string | undefined) =>
  ['projects', userId] as const;
const projectKey = (id: string) => ['project', id] as const;
const projectTagsKey = (userId: string | undefined) =>
  ['project_tags', userId] as const;

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

async function ensureProjectTag(userId: string, tag: string | null): Promise<void> {
  if (!tag) return;
  const { error } = await supabase
    .from('project_tags')
    .upsert({ user_id: userId, name: tag }, { onConflict: 'user_id,name' });
  if (error) throw error;
}

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: projectsKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (!error) return (data ?? []) as Project[];

      if (!isMissingSortOrderColumn(error)) throw error;

      const fallback = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;

      return ((fallback.data ?? []) as Project[]).map((project, index) => ({
        ...project,
        sort_order: index,
      }));
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKey(id ?? ''),
    enabled: !!id,
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

export function useCreateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      if (!user) throw new Error('Not signed in');
      const tag = normalizeTag(input.tag);
      await ensureProjectTag(user.id, tag);
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
          tag,
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
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
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
      patch: Partial<ProjectInput>;
    }) => {
      const normalizedPatch =
        patch.tag === undefined ? patch : { ...patch, tag: normalizeTag(patch.tag) };
      if (!user) throw new Error('Not signed in');
      await ensureProjectTag(user.id, normalizedPatch.tag ?? null);
      const { data, error } = await supabase
        .from('projects')
        .update(normalizedPatch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectKey(project.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
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
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
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
    },
  });
}
