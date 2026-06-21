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
const archivedTemplatesKey = (userId: string | undefined) =>
  ['project_templates', 'archived', userId] as const;
const allTemplatesKey = (userId: string | undefined) =>
  ['project_templates', 'all', userId] as const;
const templateKey = (templateId: string) => ['project_templates', templateId] as const;
const subtemplatesKey = (parentTemplateId: string | undefined) =>
  ['subtemplates', parentTemplateId] as const;
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

type TemplateListMode = 'active' | 'archived' | 'all';

function isMissingSortOrderColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message ?? '') : '';
  const details = 'details' in error ? String(error.details ?? '') : '';
  const hint = 'hint' in error ? String(error.hint ?? '') : '';
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return combined.includes('sort_order') && combined.includes('column');
}

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

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes == null) return null;
  const trimmed = notes.trim();
  return trimmed.length > 0 ? notes : null;
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

type TemplateTaskInsertRow = {
  template_id: string;
  name: string;
  type: Task['type'];
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
  sort_order: number;
  parent_id?: string | null;
  complex_mode: Task['complex_mode'];
  grouping_progress: number | null;
  groupable: boolean;
};

type ProjectTaskInsertRow = {
  project_id: string;
  name: string;
  status: 'not_started';
  type: Task['type'];
  current_progress: 0;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
  sort_order: number;
  parent_id?: string | null;
  complex_mode: Task['complex_mode'];
  grouping_progress: number | null;
  groupable: boolean;
};

function templateTaskRowFromTask(
  templateId: string,
  task: Task,
  parentId?: string | null,
): TemplateTaskInsertRow {
  return {
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
    ...(parentId === undefined ? {} : { parent_id: parentId }),
    complex_mode: task.complex_mode,
    grouping_progress: task.grouping_progress,
    groupable: task.groupable,
  };
}

function projectTaskRowFromTemplate(
  projectId: string,
  task: TemplateTask,
  parentId?: string | null,
): ProjectTaskInsertRow {
  return {
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
    sort_order: task.sort_order,
    ...(parentId === undefined ? {} : { parent_id: parentId }),
    complex_mode: task.complex_mode,
    grouping_progress: task.grouping_progress,
    groupable: task.groupable,
  };
}

async function insertTemplateTasksFromProjectTasks(
  templateId: string,
  tasks: Task[],
): Promise<void> {
  if (tasks.length === 0) return;

  const parents = tasks.filter((task) => !task.parent_id);
  const subtasks = tasks.filter((task) => task.parent_id);

  const { data: insertedParents, error: parentsError } = await supabase
    .from('template_tasks')
    .insert(parents.map((task) => templateTaskRowFromTask(templateId, task)))
    .select('id');
  if (parentsError) throw parentsError;

  const idMap = new Map<string, string>();
  parents.forEach((task, index) => {
    const inserted = insertedParents?.[index];
    if (!inserted) {
      throw new Error('Failed to save template tasks: parent insert missing id.');
    }
    idMap.set(task.id, inserted.id);
  });

  if (subtasks.length === 0) return;

  const subtaskRows = subtasks.map((task) => {
    const parentId = idMap.get(task.parent_id!);
    if (!parentId) {
      throw new Error('Failed to save template tasks: subtask parent not found.');
    }
    return templateTaskRowFromTask(templateId, task, parentId);
  });

  const { error: subtasksError } = await supabase.from('template_tasks').insert(subtaskRows);
  if (subtasksError) throw subtasksError;
}

async function insertProjectTasksFromTemplateTasks(
  projectId: string,
  templateTasks: TemplateTask[],
): Promise<void> {
  if (templateTasks.length === 0) return;

  const parents = templateTasks.filter((task) => !task.parent_id);
  const subtasks = templateTasks.filter((task) => task.parent_id);

  const { data: insertedParents, error: parentsError } = await supabase
    .from('tasks')
    .insert(parents.map((task) => projectTaskRowFromTemplate(projectId, task)))
    .select('id');
  if (parentsError) throw parentsError;

  const idMap = new Map<string, string>();
  parents.forEach((task, index) => {
    const inserted = insertedParents?.[index];
    if (!inserted) {
      throw new Error('Failed to create project tasks: parent insert missing id.');
    }
    idMap.set(task.id, inserted.id);
  });

  if (subtasks.length === 0) return;

  const subtaskRows = subtasks.map((task) => {
    const parentId = idMap.get(task.parent_id!);
    if (!parentId) {
      throw new Error('Failed to create project tasks: subtask parent not found.');
    }
    return projectTaskRowFromTemplate(projectId, task, parentId);
  });

  const { error: subtasksError } = await supabase.from('tasks').insert(subtaskRows);
  if (subtasksError) throw subtasksError;
}

async function paceOffsetsFromProject(projectId: string): Promise<{
  target_deadline_offset_seconds: number | null;
  true_deadline_offset_seconds: number | null;
}> {
  const { data, error } = await supabase
    .from('pace_settings')
    .select('target_deadline,true_deadline')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      target_deadline_offset_seconds: null,
      true_deadline_offset_seconds: null,
    };
  }
  const now = Date.now();
  return {
    target_deadline_offset_seconds: Math.round(
      (new Date(data.target_deadline).getTime() - now) / 1000,
    ),
    true_deadline_offset_seconds: Math.round(
      (new Date(data.true_deadline).getTime() - now) / 1000,
    ),
  };
}

async function nextTemplateSortOrder(
  userId: string,
  parentId: string | null,
): Promise<{ sortOrder: number; isLegacyDb: boolean }> {
  let query = supabase
    .from('project_templates')
    .select('sort_order')
    .eq('user_id', userId);
  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }
  const { data: lastTemplate, error: lastTemplateError } = await query
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const isLegacyDb = isMissingSortOrderColumn(lastTemplateError);
  if (lastTemplateError && !isLegacyDb) throw lastTemplateError;
  return {
    sortOrder: (lastTemplate?.sort_order ?? -1) + 1,
    isLegacyDb,
  };
}

async function insertTemplateRow(
  userId: string,
  input: ProjectTemplateInput,
  parentId: string | null,
): Promise<ProjectTemplate> {
  const { sortOrder, isLegacyDb } = await nextTemplateSortOrder(userId, parentId);
  const { parent_id: _ignored, ...templateFields } = input;
  const { data, error } = await supabase
    .from('project_templates')
    .insert({
      ...templateFields,
      user_id: userId,
      archived_at: null,
      parent_id: parentId,
      ...(isLegacyDb ? {} : { sort_order: sortOrder }),
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectTemplate;
}

async function createProjectFromTemplateRecord(
  userId: string,
  template: ProjectTemplate,
  projectInput: Partial<ProjectInput> | undefined,
  parentProjectId: string | null,
): Promise<Project> {
  const now = Date.now();
  const resolvedInput: ProjectInput = {
    name: projectInput?.name?.trim() || template.name,
    video_length: projectInput?.video_length ?? template.video_length,
    due_date:
      projectInput?.due_date === undefined ? null : projectInput.due_date ?? null,
    sync_true_deadline_with_due_date:
      projectInput?.sync_true_deadline_with_due_date ?? true,
    start_date: projectInput?.start_date ?? defaultStartDateIso(),
    buffer_modifier: projectInput?.buffer_modifier ?? template.buffer_modifier,
    tag:
      projectInput?.tag === undefined
        ? normalizeTag(template.tag)
        : normalizeTag(projectInput.tag),
    series:
      projectInput?.series === undefined
        ? normalizeTag(template.series)
        : normalizeTag(projectInput.series),
    notes:
      projectInput?.notes === undefined ? null : normalizeNotes(projectInput.notes),
  };

  if (parentProjectId) {
    const { data: parentProject, error: parentError } = await supabase
      .from('projects')
      .select('tag, series')
      .eq('id', parentProjectId)
      .single();
    if (parentError) throw parentError;
    resolvedInput.tag = normalizeTag(parentProject?.tag);
    resolvedInput.series = normalizeTag(parentProject?.series);
  }

  await ensureProjectTag(userId, resolvedInput.tag);
  await ensureProjectSeries(userId, resolvedInput.series);

  let sortOrder = 0;
  if (parentProjectId) {
    const { data: lastProject, error: lastProjectError } = await supabase
      .from('projects')
      .select('sort_order')
      .eq('parent_id', parentProjectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastProjectError) throw lastProjectError;
    sortOrder = (lastProject?.sort_order ?? -1) + 1;
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      ...resolvedInput,
      user_id: userId,
      parent_id: parentProjectId,
      sort_order: sortOrder,
    })
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
    await insertProjectTasksFromTemplateTasks(
      projectId,
      templateTasks as TemplateTask[],
    );
  }

  if (
    template.target_deadline_offset_seconds != null &&
    template.true_deadline_offset_seconds != null
  ) {
    const { error: paceInsertError } = await supabase.from('pace_settings').insert({
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
}

export function useTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: templatesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectTemplate[]> => fetchTemplates('active'),
  });
}

async function fetchTemplates(mode: TemplateListMode): Promise<ProjectTemplate[]> {
  let request = supabase
    .from('project_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (mode === 'active') {
    request = request.is('archived_at', null);
  } else if (mode === 'archived') {
    request = request.not('archived_at', 'is', null).order('archived_at', {
      ascending: false,
    });
  }
  const { data, error } = await request;

  if (!error) return (data ?? []) as ProjectTemplate[];
  if (!isMissingSortOrderColumn(error)) throw error;

  let fallback = supabase
    .from('project_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (mode === 'active') {
    fallback = fallback.is('archived_at', null);
  } else if (mode === 'archived') {
    fallback = fallback.not('archived_at', 'is', null).order('archived_at', {
      ascending: false,
    });
  }
  const fallbackResult = await fallback;
  if (fallbackResult.error) throw fallbackResult.error;

  return ((fallbackResult.data ?? []) as ProjectTemplate[]).map((template, index) => ({
    ...template,
    sort_order: index,
  }));
}

export function useArchivedTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: archivedTemplatesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectTemplate[]> => fetchTemplates('archived'),
  });
}

export function useAllTemplatesIncludingArchived() {
  const { user } = useAuth();
  return useQuery({
    queryKey: allTemplatesKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<ProjectTemplate[]> => fetchTemplates('all'),
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

export function useSubtemplates(parentTemplateId: string | undefined) {
  return useQuery({
    queryKey: subtemplatesKey(parentTemplateId),
    enabled: !!parentTemplateId,
    queryFn: async (): Promise<ProjectTemplate[]> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('parent_id', parentTemplateId!)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectTemplate[];
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
      subprojects,
    }: {
      name: string;
      project: Project;
      tasks: Task[];
      subprojects?: { project: Project; tasks: Task[] }[];
    }) => {
      if (!user) throw new Error('Not signed in');

      const template = await insertTemplateRow(
        user.id,
        {
          name: name.trim(),
          video_length: project.video_length,
          buffer_modifier: project.buffer_modifier,
          tag: project.tag,
          series: project.series,
          target_deadline_offset_seconds: null,
          true_deadline_offset_seconds: null,
        },
        null,
      );

      if (tasks.length > 0) {
        await insertTemplateTasksFromProjectTasks(template.id, tasks);
      }

      if (subprojects?.length) {
        for (const subproject of subprojects) {
          const offsets = await paceOffsetsFromProject(subproject.project.id);
          const childTemplate = await insertTemplateRow(
            user.id,
            {
              name: subproject.project.name,
              video_length: subproject.project.video_length,
              buffer_modifier: subproject.project.buffer_modifier,
              tag: subproject.project.tag,
              series: subproject.project.series,
              target_deadline_offset_seconds: offsets.target_deadline_offset_seconds,
              true_deadline_offset_seconds: offsets.true_deadline_offset_seconds,
              parent_id: template.id,
            },
            template.id,
          );
          if (subproject.tasks.length > 0) {
            await insertTemplateTasksFromProjectTasks(
              childTemplate.id,
              subproject.tasks,
            );
          }
        }
      }

      return template;
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: subtemplatesKey(template.id) });
      qc.invalidateQueries({ queryKey: ['template_tasks'] });
    },
  });
}

export function useCreateSubtemplate(parentTemplateId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ProjectTemplateInput) => {
      if (!user) throw new Error('Not signed in');
      const template = await insertTemplateRow(
        user.id,
        {
          ...input,
          parent_id: parentTemplateId,
        },
        parentTemplateId,
      );
      return template;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: subtemplatesKey(parentTemplateId) });
      qc.invalidateQueries({ queryKey: templateKey(parentTemplateId) });
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
      const project = await createProjectFromTemplateRecord(
        user.id,
        template,
        projectInput,
        null,
      );

      const { data: childTemplates, error: childTemplatesError } = await supabase
        .from('project_templates')
        .select('*')
        .eq('parent_id', template.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (childTemplatesError) throw childTemplatesError;

      for (const childTemplate of (childTemplates ?? []) as ProjectTemplate[]) {
        await createProjectFromTemplateRecord(
          user.id,
          childTemplate,
          { name: childTemplate.name },
          project.id,
        );
      }

      return project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectsKey(user?.id) });
      qc.invalidateQueries({ queryKey: tasksKey(project.id) });
      qc.invalidateQueries({ queryKey: paceKey(project.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
      qc.invalidateQueries({ queryKey: ['subprojects', project.id] });
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
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
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
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: templateKey(template.id) });
      qc.invalidateQueries({ queryKey: projectTagsKey(user?.id) });
      qc.invalidateQueries({ queryKey: projectSeriesKey(user?.id) });
    },
  });
}

export function useArchiveTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const archivedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('project_templates')
        .update({ archived_at: archivedAt })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      const { error: childrenError } = await supabase
        .from('project_templates')
        .update({ archived_at: archivedAt })
        .eq('parent_id', id);
      if (childrenError) throw childrenError;
      return data as ProjectTemplate;
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: templateKey(template.id) });
      qc.invalidateQueries({ queryKey: subtemplatesKey(template.id) });
    },
  });
}

export function useRestoreTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('project_templates')
        .update({ archived_at: null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      const { error: childrenError } = await supabase
        .from('project_templates')
        .update({ archived_at: null })
        .eq('parent_id', id);
      if (childrenError) throw childrenError;
      return data as ProjectTemplate;
    },
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: templateKey(template.id) });
      qc.invalidateQueries({ queryKey: subtemplatesKey(template.id) });
    },
  });
}

export function useReorderTemplates() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (templateIds: string[]) => {
      const updates = await Promise.all(
        templateIds.map((id, index) =>
          supabase
            .from('project_templates')
            .update({ sort_order: index })
            .eq('id', id)
            .select('id')
            .single(),
        ),
      );

      const firstError = updates.find((result) => result.error)?.error;
      if (firstError && isMissingSortOrderColumn(firstError)) return templateIds;
      if (firstError) throw firstError;

      return templateIds;
    },
    onMutate: async (templateIds) => {
      await qc.cancelQueries({ queryKey: templatesKey(user?.id) });
      const previous = qc.getQueryData<ProjectTemplate[]>(templatesKey(user?.id));

      if (previous) {
        const byId = new Map(previous.map((template) => [template.id, template]));
        const next = templateIds
          .map((id, index) => {
            const template = byId.get(id);
            if (!template) return null;
            return { ...template, sort_order: index };
          })
          .filter((template): template is ProjectTemplate => !!template);
        qc.setQueryData(templatesKey(user?.id), next);
      }

      return { previous };
    },
    onError: (_err, _templateIds, context) => {
      if (context?.previous) {
        qc.setQueryData(templatesKey(user?.id), context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: templatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: archivedTemplatesKey(user?.id) });
      qc.invalidateQueries({ queryKey: allTemplatesKey(user?.id) });
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
