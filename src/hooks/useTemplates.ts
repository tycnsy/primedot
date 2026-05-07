import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  Project,
  ProjectInput,
  ProjectTemplate,
  ProjectTemplateInput,
  Task,
  TemplateTask,
} from '../lib/types';

const templatesKey = (userId: string | undefined) =>
  ['project_templates', userId] as const;
const templateTasksManyKey = (templateIds: string[]) =>
  ['template_tasks', 'many', ...templateIds] as const;
const projectsKey = (userId: string | undefined) => ['projects', userId] as const;
const tasksKey = (projectId: string) => ['tasks', projectId] as const;
const paceKey = (projectId: string) => ['pace_settings', projectId] as const;
const projectTagsKey = (userId: string | undefined) =>
  ['project_tags', userId] as const;

function normalizeTag(tag: string | null | undefined): string | null {
  if (tag == null) return null;
  const trimmed = tag.trim();
  return trimmed.length > 0 ? trimmed : null;
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
        buffer_modifier:
          projectInput?.buffer_modifier ?? template.buffer_modifier,
        tag:
          projectInput?.tag === undefined
            ? normalizeTag(template.tag)
            : normalizeTag(projectInput.tag),
      };

      if (resolvedInput.tag) {
        const { error: tagError } = await supabase
          .from('project_tags')
          .upsert(
            { user_id: user.id, name: resolvedInput.tag },
            { onConflict: 'user_id,name' },
          );
        if (tagError) throw tagError;
      }

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
        .order('created_at', { ascending: true });
      if (readTemplateTasksError) throw readTemplateTasksError;

      if ((templateTasks ?? []).length > 0) {
        const tasksToInsert = (templateTasks as TemplateTask[]).map((task) => ({
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
    },
  });
}
