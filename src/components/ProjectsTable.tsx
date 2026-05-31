import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectUpdateInput } from '../lib/types';
import type { Project } from '../lib/types';
import type { ProjectGroupBy, ProjectSortBy } from '../lib/projectGrouping';
import { buildProjectGroups } from '../lib/projectGrouping';
import { formatHMS, parseHMS } from '../lib/time';
import TagPill from './TagPill';

interface ProjectsTableProps {
  projects: Project[];
  groupBy: ProjectGroupBy;
  sortBy: ProjectSortBy;
  onGroupByChange: (value: ProjectGroupBy) => void;
  onSortByChange: (value: ProjectSortBy) => void;
  tagColorByName: Map<string, string>;
  seriesColorByName: Map<string, string>;
  tagOptions: string[];
  seriesOptions: string[];
  onUpdateProject: (id: string, patch: ProjectUpdateInput) => Promise<void>;
  onArchiveProject?: (id: string) => Promise<void>;
}

function formatDueDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type EditableField =
  | 'tag'
  | 'series'
  | 'video_length'
  | 'buffer_modifier'
  | 'due_date';

interface EditingCell {
  projectId: string;
  field: EditableField;
}

export default function ProjectsTable({
  projects,
  groupBy,
  sortBy,
  onGroupByChange,
  onSortByChange,
  tagColorByName,
  seriesColorByName,
  tagOptions,
  seriesOptions,
  onUpdateProject,
  onArchiveProject,
}: ProjectsTableProps) {
  const groups = buildProjectGroups(projects, groupBy, sortBy);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [cellError, setCellError] = useState<string | null>(null);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [archivingProjectId, setArchivingProjectId] = useState<string | null>(null);

  const activeCellKey = editingCell
    ? `${editingCell.projectId}:${editingCell.field}`
    : null;

  const beginEdit = (project: Project, field: EditableField) => {
    const value =
      field === 'tag'
        ? project.tag ?? ''
        : field === 'series'
          ? project.series ?? ''
          : field === 'video_length'
            ? formatHMS(project.video_length)
            : field === 'buffer_modifier'
              ? String(project.buffer_modifier)
              : toLocalDateTimeInput(project.due_date);
    setEditingCell({ projectId: project.id, field });
    setDraftValue(value);
    setCellError(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setDraftValue('');
    setCellError(null);
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const project = projectById.get(editingCell.projectId);
    if (!project) {
      cancelEdit();
      return;
    }

    const field = editingCell.field;
    let patch: ProjectUpdateInput | null = null;

    if (field === 'tag') {
      const tag = draftValue.trim() || null;
      if ((project.tag ?? null) === tag) {
        cancelEdit();
        return;
      }
      patch = { tag };
    } else if (field === 'series') {
      const series = draftValue.trim() || null;
      if ((project.series ?? null) === series) {
        cancelEdit();
        return;
      }
      patch = { series };
    } else if (field === 'video_length') {
      const videoLength = parseHMS(draftValue);
      if (videoLength == null) {
        setCellError('Video length must be hh:mm:ss.');
        return;
      }
      if (videoLength === project.video_length) {
        cancelEdit();
        return;
      }
      patch = { video_length: videoLength };
    } else if (field === 'buffer_modifier') {
      const buffer = Number.parseFloat(draftValue);
      if (!Number.isFinite(buffer) || buffer <= 0) {
        setCellError('Buffer modifier must be a positive number.');
        return;
      }
      if (buffer === project.buffer_modifier) {
        cancelEdit();
        return;
      }
      patch = { buffer_modifier: buffer };
    } else {
      const dueDate = draftValue ? fromLocalDateTimeInput(draftValue) : null;
      if (draftValue && !dueDate) {
        setCellError('Due date must be valid.');
        return;
      }
      const dueTime = dueDate ? new Date(dueDate).getTime() : null;
      const existingDueTime = project.due_date ? new Date(project.due_date).getTime() : null;
      if (dueTime === existingDueTime) {
        cancelEdit();
        return;
      }
      patch = { due_date: dueDate };
    }

    const key = `${project.id}:${field}`;
    setSavingCellKey(key);
    setCellError(null);
    try {
      await onUpdateProject(project.id, patch);
      cancelEdit();
    } catch (error) {
      setCellError(error instanceof Error ? error.message : 'Failed to save.');
    } finally {
      setSavingCellKey((prev) => (prev === key ? null : prev));
    }
  };

  const renderCell = (
    project: Project,
    field: EditableField,
    display: ReactNode,
    options?: {
      type?: 'text' | 'number' | 'datetime-local';
      step?: string;
      min?: string;
      list?: string;
      mono?: boolean;
      placeholder?: string;
    },
  ) => {
    const key = `${project.id}:${field}`;
    const isEditing = activeCellKey === key;
    const isSaving = savingCellKey === key;
    const hasError = isEditing && !!cellError;
    const inputClass = `input h-8 w-full text-sm ${options?.mono ? 'font-sans' : ''} ${
      hasError ? 'border-danger' : ''
    }`;

    if (isEditing) {
      return (
        <div className="space-y-1">
          <input
            autoFocus
            type={options?.type ?? 'text'}
            list={options?.list}
            min={options?.min}
            step={options?.step}
            placeholder={options?.placeholder}
            value={draftValue}
            disabled={isSaving}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit();
              }
            }}
            className={inputClass}
          />
          {hasError ? <p className="text-xs text-danger">{cellError}</p> : null}
        </div>
      );
    }

    return (
      <button
        type="button"
        className="w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-surface2/70"
        onClick={() => beginEdit(project, field)}
      >
        {display}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <datalist id="project-table-tag-options">
        {tagOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="project-table-series-options">
        {seriesOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="label" htmlFor="projects-group-by">
            Group by
          </label>
          <select
            id="projects-group-by"
            className="input"
            value={groupBy}
            onChange={(event) => onGroupByChange(event.target.value as ProjectGroupBy)}
          >
            <option value="none">None</option>
            <option value="week">Week (Sun-Sat)</option>
            <option value="month">Month</option>
            <option value="tag">Tag</option>
            <option value="series">Series</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="projects-sort-by">
            Sort by
          </label>
          <select
            id="projects-sort-by"
            className="input"
            value={sortBy}
            onChange={(event) => onSortByChange(event.target.value as ProjectSortBy)}
          >
            <option value="due_date">Due date</option>
            <option value="series">Series</option>
          </select>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="card space-y-3">
          {groupBy !== 'none' ? (
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{group.label}</h2>
              <span className="text-xs text-muted">{group.projects.length} projects</span>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="border-b border-border px-2 py-2 font-semibold">Name</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Tag</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Series</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Video</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Buffer</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Due</th>
                  <th className="border-b border-border px-2 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.projects.map((project) => (
                  <tr key={project.id} className="group">
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      <Link
                        to={`/projects/${project.id}`}
                        className="block w-full rounded-md px-1 py-1 font-medium text-fg transition-colors hover:bg-surface2/70 group-hover:text-accent"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {renderCell(
                        project,
                        'tag',
                        project.tag ? (
                          <TagPill
                            name={project.tag}
                            color={tagColorByName.get(project.tag) ?? null}
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        ),
                        { list: 'project-table-tag-options', placeholder: 'optional' },
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {renderCell(
                        project,
                        'series',
                        project.series ? (
                          <TagPill
                            name={project.series}
                            color={seriesColorByName.get(project.series) ?? null}
                          />
                        ) : (
                          <span className="text-muted">-</span>
                        ),
                        { list: 'project-table-series-options', placeholder: 'optional' },
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 font-sans text-sm text-fg">
                      {renderCell(project, 'video_length', formatHMS(project.video_length), {
                        mono: true,
                      })}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {renderCell(project, 'buffer_modifier', `x${project.buffer_modifier}`, {
                        type: 'number',
                        min: '0.1',
                        step: '0.01',
                      })}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {renderCell(project, 'due_date', formatDueDateTime(project.due_date), {
                        type: 'datetime-local',
                      })}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-right">
                      {onArchiveProject ? (
                        <button
                          type="button"
                          className="btn-ghost !h-8 !px-2.5 text-xs"
                          disabled={archivingProjectId === project.id}
                          onClick={async () => {
                            setArchivingProjectId(project.id);
                            try {
                              await onArchiveProject(project.id);
                            } finally {
                              setArchivingProjectId((prev) =>
                                prev === project.id ? null : prev,
                              );
                            }
                          }}
                        >
                          {archivingProjectId === project.id ? 'Archiving…' : 'Archive'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
