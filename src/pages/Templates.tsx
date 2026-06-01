import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useArchiveTemplate,
  useCreateProjectFromTemplate,
  useDeleteTemplate,
  useReorderTemplates,
  useTemplateTasksForTemplates,
  useTemplates,
} from '../hooks/useTemplates';
import { useProjectSeries, useProjectTags } from '../hooks/useProjects';
import TagPill from '../components/TagPill';
import type { ProjectTemplate } from '../lib/types';
import { formatHMS } from '../lib/time';

export default function Templates() {
  const navigate = useNavigate();
  const templatesQ = useTemplates();
  const projectTags = useProjectTags();
  const projectSeries = useProjectSeries();
  const [activeTemplate, setActiveTemplate] = useState<ProjectTemplate | null>(null);
  const [orderedTemplates, setOrderedTemplates] = useState<ProjectTemplate[]>([]);
  const [draggedTemplateId, setDraggedTemplateId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [archivingTemplateId, setArchivingTemplateId] = useState<string | null>(null);
  const createProjectFromTemplate = useCreateProjectFromTemplate();
  const deleteTemplate = useDeleteTemplate();
  const archiveTemplate = useArchiveTemplate();
  const reorderTemplates = useReorderTemplates();
  useEffect(() => {
    setOrderedTemplates(templatesQ.data ?? []);
  }, [templatesQ.data]);

  const tagColorByName = useMemo(
    () => new Map((projectTags.data ?? []).map((tag) => [tag.name, tag.color] as const)),
    [projectTags.data],
  );
  const seriesColorByName = useMemo(
    () =>
      new Map(
        (projectSeries.data ?? []).map((series) => [series.name, series.color] as const),
      ),
    [projectSeries.data],
  );
  const templateIds = useMemo(
    () => orderedTemplates.map((template) => template.id),
    [orderedTemplates],
  );
  const templateTasksQ = useTemplateTasksForTemplates(templateIds);
  const taskCountByTemplate = useMemo(() => {
    return (templateTasksQ.data ?? []).reduce<Record<string, number>>((acc, task) => {
      acc[task.template_id] = (acc[task.template_id] ?? 0) + 1;
      return acc;
    }, {});
  }, [templateTasksQ.data]);

  const openCreateFlow = (template: ProjectTemplate) => {
    setActiveTemplate(template);
    setProjectName(`${template.name} Project`);
    setCreateError(null);
  };

  const reorder = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const previous = orderedTemplates;
    const sourceIndex = previous.findIndex((template) => template.id === sourceId);
    const targetIndex = previous.findIndex((template) => template.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...previous];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setOrderedTemplates(reordered);
    setReorderError(null);
    try {
      await reorderTemplates.mutateAsync(reordered.map((template) => template.id));
    } catch (error) {
      setOrderedTemplates(previous);
      setReorderError(
        error instanceof Error ? error.message : 'Failed to reorder templates.',
      );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Workspace</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Templates</h1>
          <p className="max-w-md text-sm text-muted">
            Save reusable project blueprints with premade settings and tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/templates/archive" className="btn-ghost">
            View archive
          </Link>
          <Link to="/projects" className="btn-ghost">
            Back to projects
          </Link>
        </div>
      </div>

      {activeTemplate ? (
        <div className="card animate-fade-in space-y-3">
          <h2 className="text-lg font-semibold text-fg">
            Create project from "{activeTemplate.name}"
          </h2>
          <div className="space-y-1">
            <label className="label" htmlFor="template-project-name">
              Project name
            </label>
            <input
              id="template-project-name"
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My project"
            />
          </div>
          {createError ? <p className="text-xs text-danger">{createError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTemplate(null);
                setCreateError(null);
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createProjectFromTemplate.isPending}
              onClick={async () => {
                if (!projectName.trim()) {
                  setCreateError('Project name is required.');
                  return;
                }
                try {
                  const created = await createProjectFromTemplate.mutateAsync({
                    template: activeTemplate,
                    projectInput: {
                      name: projectName.trim(),
                    },
                  });
                  navigate(`/projects/${created.id}`);
                } catch (err) {
                  setCreateError(
                    err instanceof Error ? err.message : 'Failed to create project.',
                  );
                }
              }}
              className="btn-primary"
            >
              {createProjectFromTemplate.isPending ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      ) : null}

      {templatesQ.isLoading ? <p className="text-muted">Loading templates…</p> : null}
      {templatesQ.error ? (
        <p className="text-danger">
          {templatesQ.error instanceof Error
            ? templatesQ.error.message
            : 'Failed to load templates.'}
        </p>
      ) : null}
      {deleteError ? <p className="text-danger">{deleteError}</p> : null}
      {archiveError ? <p className="text-danger">{archiveError}</p> : null}
      {reorderError ? <p className="text-danger">{reorderError}</p> : null}

      {orderedTemplates.length === 0 && !templatesQ.isLoading ? (
        <div className="card text-center text-sm text-muted">
          No templates yet. Open any project and click "Save as template" to add one.
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {orderedTemplates.map((template) => (
          <li
            key={template.id}
            className={`card space-y-3 ${draggedTemplateId === template.id ? 'opacity-60' : ''}`}
            draggable
            onDragStart={(event) => {
              setDraggedTemplateId(template.id);
              event.dataTransfer.setData('text/template-id', template.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/template-id');
              setDraggedTemplateId(null);
              if (sourceId) void reorder(sourceId, template.id);
            }}
            onDragEnd={() => setDraggedTemplateId(null)}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-medium text-fg">{template.name}</h3>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {template.tag ? (
                  <TagPill
                    name={template.tag}
                    color={tagColorByName.get(template.tag) ?? null}
                  />
                ) : null}
                {template.series ? (
                  <TagPill
                    name={template.series}
                    color={seriesColorByName.get(template.series) ?? null}
                  />
                ) : null}
              </div>
            </div>
            <div className="divider" />
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="Video" value={formatHMS(template.video_length)} mono />
              <Metric label="Buffer" value={`×${template.buffer_modifier}`} />
              <Metric label="Tasks" value={String(taskCountByTemplate[template.id] ?? 0)} />
            </dl>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label={`Delete template ${template.name}`}
                title="Delete template"
                disabled={deletingTemplateId === template.id}
                onClick={async () => {
                  if (!confirm(`Delete template "${template.name}"?`)) return;
                  const isActiveTemplate = activeTemplate?.id === template.id;
                  setDeleteError(null);
                  setDeletingTemplateId(template.id);
                  try {
                    await deleteTemplate.mutateAsync(template.id);
                    if (isActiveTemplate) {
                      setActiveTemplate(null);
                      setCreateError(null);
                    }
                  } catch (err) {
                    setDeleteError(
                      err instanceof Error ? err.message : 'Failed to delete template.',
                    );
                  } finally {
                    setDeletingTemplateId(null);
                  }
                }}
                className="btn-ghost !h-8 !w-8 !rounded-md !p-0 text-danger disabled:opacity-60"
              >
                {deletingTemplateId === template.id ? (
                  <span className="text-[10px] leading-none">…</span>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="mx-auto h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Archive template "${template.name}"?`)) return;
                    const isActiveTemplate = activeTemplate?.id === template.id;
                    setArchiveError(null);
                    setArchivingTemplateId(template.id);
                    try {
                      await archiveTemplate.mutateAsync(template.id);
                      if (isActiveTemplate) {
                        setActiveTemplate(null);
                        setCreateError(null);
                      }
                    } catch (err) {
                      setArchiveError(
                        err instanceof Error ? err.message : 'Failed to archive template.',
                      );
                    } finally {
                      setArchivingTemplateId(null);
                    }
                  }}
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                  disabled={archivingTemplateId === template.id}
                >
                  {archivingTemplateId === template.id ? 'Archiving…' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/templates/${template.id}`)}
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => openCreateFlow(template)}
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                >
                  Use template
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 text-sm text-fg ${mono ? 'font-sans tabular-nums' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
