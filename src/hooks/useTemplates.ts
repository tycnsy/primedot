import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  Project,
  ProjectInput,
  ProjectTemplate,
  ProjectTemplateInput,
  ProjectTemplateUpdateInput,
  Task,
  TemplateTask,
  TemplateTaskCreateInput,
  TemplateTaskUpdateInput,
} from '../lib/types';

const templatesKey = (userId: string | undefined) =>
  ['project_templates', userId] as const;
const templateKey = (templateId: string) => ['project_templates', templateId] as const;
const templateTasksManyKey = (templateIds: string[]) =>
  ['template_tasks', 'many', ...templateIds] as const;
const templateTasksKey = (templateId: string) =>
  ['template_tasks', templateId] as const;
const projectsKey = (userId: string | undefined) => ['projects', userId] as const;
const tasksKey = (projectId: string) => ['tasks', projectId] as const;
const paceKey = (projectId: string) => ['pace_settings', projectId] as const;
const projectTagsKey = (userId: string | undefined) =>
  ['project_tags', userId] as const;
const projectSeriesKey = (userId: string | undefined) =>
  ['project_series', userId] as const;

function defaultStartDateIso(): string {
  const now = new Date();
  now.setHours(5, 0, 0, 0);
  return now.toISOString();
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

async function ensureProjectSeries(
  userId: string,
  series: string | null,
): Promise<void> {
  if (!series) return;
  const { error } = await supabase
    .from('project_series')
    .upsert({ user_id: userId, name: series }, { onConflict: 'user_id,name' });
  if (error) throw error;
}

export function useTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: templatesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectTemplate[]> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectTemplate[];
    },
  });
}

export function useTemplateTasksForTemplates(templateIds: string[]) {
  return useQuery({
    queryKey: templateTasksManyKey(templateIds),
    enabled: templateIds.length > 0,
    queryFn: async (): Promise<TemplateTask[]> => {
      const { data, error } = await supabase
        .from('template_tasks')
        .select('*')
        .in('template_id', templateIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateTask[];
    },
  });
}

export function useTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: templateKey(templateId ?? ''),
    enabled: !!templateId,
    queryFn: async (): Promise<ProjectTemplate | null> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('id', templateId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProjectTemplate | null;
    },
  });
}

export function useTemplateTasks(templateId: string | undefined) {
  return useQuery({
    queryKey: templateTasksKey(templateId ?? ''),
    enabled: !!templateId,
    queryFn: async (): Promise<TemplateTask[]> => {
      const { data, error } = await supabase
        .from('template_tasks')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateTask[];
    },
  });
}

export function useCreateTemplateFromProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      project,
      tasks,
    }: {
      name: string;
      project: Project;
      tasks: Task[];
    }) => {
      if (!user) throw new Error('Not signed in');
      const templateInput: ProjectTemplateInput = {
        name: name.trim(),
        video_length: project.video_length,
        buffer_modifier: project.buffer_modifier,
        tag: project.tag,
        series: project.series,
        target_deadline_offset_seconds: null,
        true_deadline_offset_seconds: null,
      };

      const { data: template, error: templateError } = await supabase
        .from('project_templates')
        .insert({
          ...templateInput,
          user_id: user.id,
        })
        .select()
        .single();
      if (templateError) throw templateError;

      const templateId = (template as ProjectTemplate).id;
      if (tasks.length > 0) {
        const templateTasks = tasks.map((task) => ({
          template_id: templateId,
          name: task.name,
          type: task.type,
          scaling_modifier: task.scaling_modifier,
          scripting_modifier: task.scripting_modifier,
          script_length: task.script_length,
          unit_count: task.unit_count,
          unit_length: task.unit_length,
          manual_length: task.manual_length,
          sort_order: task.sort_order,
        }));
        const { error: tasksError } = await supabase
          .from('template_tasks')
          .insert(templateTasks);
        if (tasksError) throw tasksError;
      }

      return template as ProjectTemplate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: ['template_tasks'] });
    },
  });
}

export function useCreateProjectFromTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      template,
      projectInput,
    }: {
      template: ProjectTemplate;
      projectInput?: Partial<ProjectInput>;
    }) => {
      if (!user) throw new Error('Not signed in');
      const now = Date.now();
      const resolvedInput: ProjectInput = {
        name: projectInput?.name?.trim() || template.name,
        video_length: projectInput?.video_length ?? template.video_length,
        due_date:
          projectInput?.due_date === undefined
            ? null
            : projectInput.due_date ?? null,
        sync_true_deadline_with_due_date:
          projectInput?.sync_true_deadline_with_due_date ?? true,
        start_date: projectInput?.start_date ?? defaultStartDateIso(),
        buffer_modifier:
          projectInput?.buffer_modifier ?? template.buffer_modifier,
        tag:
          projectInput?.tag === undefined
            ? normalizeTag(template.tag)
            : normalizeTag(projectInput.tag),
        series:
          projectInput?.series === undefined
            ? normalizeTag(template.series)
            : normalizeTag(projectInput.series),
      };

      await ensureProjectTag(user.id, resolvedInput.tag);
      await ensureProjectSeries(user.id, resolvedInput.series);

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({ ...resolvedInput, user_id: user.id })
        .select()
        .single();
      if (projectError) throw projectError;
      const projectId = (project as Project).id;

      const { data: templateTasks, error: readTemplateTasksError } = await supabase
        .from('template_tasks')
        .select('*')
        .eq('template_id', template.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (readTemplateTasksError) throw readTemplateTasksError;

      if ((templateTasks ?? []).length > 0) {
        const tasksToInsert = (templateTasks as TemplateTask[]).map((task, index) => ({
          project_id: projectId,
          name: task.name,
          status: 'not_started',
          type: task.type,
          current_progress: 0,
          scaling_modifier: task.scaling_modifier,
          scripting_modifier: task.scripting_modifier,
          script_length: task.script_length,
          unit_count: task.unit_count,
          unit_length: task.unit_length,
          manual_length: task.manual_length,
          sort_order: index,
        }));
        const { error: tasksInsertError } = await supabase
          .from('tasks')
          .insert(tasksToInsert);
        if (tasksInsertError) throw tasksInsertError;
      }

      if (
        template.target_deadline_offset_seconds != null &&
        template.true_deadline_offset_seconds != null
      ) {
        const { error: paceInsertError } = await supabase
          .from('pace_settings')
          .insert({
            project_id: projectId,
            target_deadline: new Date(
              now + template.target_deadline_offset_seconds * 1000,
            ).toISOString(),
            true_deadline: new Date(
              now + template.true_deadline_offset_seconds * 1000,
            ).toISOString(),
          });
        if (paceInsertError) throw paceInsertError;
      }

      return project as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: tasksKey(project.id) });
      qc.invalidateQueries({ queryKey: paceKey(project.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (templateId: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('project_templates')
        .delete()
        .eq('id', templateId);
      if (error) throw error;
      return templateId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: ['template_tasks'] });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ProjectTemplateUpdateInput;
    }) => {
      if (!user) throw new Error('Not signed in');
      const normalizedPatch: ProjectTemplateUpdateInput = {
        ...patch,
        ...(patch.tag === undefined ? {} : { tag: normalizeTag(patch.tag) }),
        ...(patch.series === undefined ? {} : { series: normalizeTag(patch.series) }),
      };
      await ensureProjectTag(user.id, normalizedPatch.tag ?? null);
      await ensureProjectSeries(user.id, normalizedPatch.series ?? null);

      const { data, error } = await supabase
        .from('project_templates')
        .update(normalizedPatch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProjectTemplate;
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: templateKey(template.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useCreateTemplateTask(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TemplateTaskCreateInput, 'template_id'>) => {
      const payload: TemplateTaskCreateInput = { ...input, template_id: templateId };
      const { data, error } = await supabase
        .from('template_tasks')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data as TemplateTask;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateTasksKey(templateId) });
      qc.invalidateQueries({ queryKey: ['template_tasks', 'many'] });
    },
  });
}

export function useUpdateTemplateTask(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TemplateTaskUpdateInput;
    }) => {
      const { data, error } = await supabase
        .from('template_tasks')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as TemplateTask;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateTasksKey(templateId) });
      qc.invalidateQueries({ queryKey: ['template_tasks', 'many'] });
    },
  });
}

export function useDeleteTemplateTask(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('template_tasks').delete().eq('id', taskId);
      if (error) throw error;
      return taskId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateTasksKey(templateId) });
      qc.invalidateQueries({ queryKey: ['template_tasks', 'many'] });
    },
  });
}

export function useReplaceTemplateTasksOrder(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      const updates = await Promise.all(
        taskIds.map((id, index) =>
          supabase
            .from('template_tasks')
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateTasksKey(templateId) });
      qc.invalidateQueries({ queryKey: ['template_tasks', 'many'] });
    },
  });
}
