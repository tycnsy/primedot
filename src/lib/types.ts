export type TaskStatus = 'not_started' | 'in_progress' | 'complete';
export type TaskType = 'scaling' | 'scripting' | 'custom' | 'manual';
export type ComplexMode = 'compressed' | 'expanded';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  video_length: number;
  due_date: string | null;
  sync_true_deadline_with_due_date: boolean;
  buffer_modifier: number;
  tag: string | null;
  series: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  start_date: string;
  archived_at: string | null;
  pace_hidden: boolean;
  parent_id: string | null;
}

export interface ProjectTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
}

export interface ProjectSeries {
  id: string;
  user_id: string;
  name: string;
  color: string;
  tag: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface TagGoal {
  id: string;
  user_id: string;
  tag_name: string;
  daily_goal_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface HeatmapSettings {
  user_id: string;
  yearly_start_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  status: TaskStatus;
  type: TaskType;
  current_progress: number;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
  sort_order: number;
  parent_id: string | null;
  complex_mode: ComplexMode | null;
  grouping_progress: number | null;
  groupable: boolean;
  created_at: string;
}

/** A scaling task that is the parent of one or more subtasks. */
export type ComplexParent = Task & {
  type: 'scaling';
  parent_id: null;
  complex_mode: ComplexMode;
};

export interface PaceSettings {
  id: string;
  project_id: string;
  target_deadline: string;
  true_deadline: string;
}

export interface ProjectTemplate {
  id: string;
  user_id: string;
  name: string;
  video_length: number;
  buffer_modifier: number;
  tag: string | null;
  series: string | null;
  target_deadline_offset_seconds: number | null;
  true_deadline_offset_seconds: number | null;
  archived_at: string | null;
  sort_order: number;
  created_at: string;
  parent_id: string | null;
}

export interface TemplateTask {
  id: string;
  template_id: string;
  name: string;
  type: TaskType;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
  sort_order: number;
  parent_id: string | null;
  complex_mode: ComplexMode | null;
  grouping_progress: number | null;
  groupable: boolean;
  created_at: string;
}

export type ProjectInput = Pick<
  Project,
  | 'name'
  | 'video_length'
  | 'due_date'
  | 'sync_true_deadline_with_due_date'
  | 'start_date'
  | 'buffer_modifier'
  | 'tag'
  | 'series'
  | 'notes'
> & {
  parent_id?: string | null;
};

export type ProjectUpdateInput = Partial<
  Pick<
    Project,
    | 'name'
    | 'video_length'
    | 'due_date'
    | 'start_date'
    | 'buffer_modifier'
    | 'tag'
    | 'series'
    | 'notes'
    | 'sync_true_deadline_with_due_date'
  >
>;

export type TaskInput = Omit<Task, 'id' | 'created_at' | 'sort_order'>;

export type PaceSettingsInput = Pick<
  PaceSettings,
  'project_id' | 'target_deadline' | 'true_deadline'
>;

export type ProjectTemplateInput = Pick<
  ProjectTemplate,
  | 'name'
  | 'video_length'
  | 'buffer_modifier'
  | 'tag'
  | 'series'
  | 'target_deadline_offset_seconds'
  | 'true_deadline_offset_seconds'
> & {
  parent_id?: string | null;
};

export type TemplateTaskInput = Omit<TemplateTask, 'id' | 'created_at'>;
export type ProjectTemplateUpdateInput = Partial<ProjectTemplateInput>;
export type TemplateTaskCreateInput = TemplateTaskInput;
export type TemplateTaskUpdateInput = Partial<
  Omit<TemplateTaskInput, 'template_id'>
>;

export interface IntegrationToken {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export type RealtimeLogChangeKind =
  | 'current_progress'
  | 'task_name'
  | 'task_type'
  | 'scaling_modifier'
  | 'scripting_modifier'
  | 'script_length'
  | 'unit_count'
  | 'unit_length'
  | 'video_length'
  | 'project_name'
  | 'project_tag'
  | 'project_series'
  | 'task_created'
  | 'task_deleted';

export interface RealtimeLog {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  change_kind: RealtimeLogChangeKind;
  old_value: string | null;
  new_value: string | null;
  realtime_delta_seconds: number;
  task_name: string | null;
  task_type: string | null;
  project_name: string;
  project_tag: string | null;
  project_series: string | null;
  video_length: number | null;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  current_progress: number | null;
  logged_at: string;
}

export type RealtimeLogUpdateInput = Partial<
  Pick<RealtimeLog, 'realtime_delta_seconds' | 'old_value' | 'new_value'>
>;
