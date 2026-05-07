export type TaskStatus = 'not_started' | 'in_progress' | 'complete';
export type TaskType = 'scaling' | 'scripting' | 'custom' | 'manual';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  video_length: number;
  due_date: string | null;
  buffer_modifier: number;
  tag: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProjectTag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
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
  created_at: string;
}

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
  target_deadline_offset_seconds: number | null;
  true_deadline_offset_seconds: number | null;
  created_at: string;
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
  created_at: string;
}

export type ProjectInput = Pick<
  Project,
  'name' | 'video_length' | 'due_date' | 'buffer_modifier' | 'tag'
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
  | 'target_deadline_offset_seconds'
  | 'true_deadline_offset_seconds'
>;

export type TemplateTaskInput = Omit<TemplateTask, 'id' | 'created_at'>;
