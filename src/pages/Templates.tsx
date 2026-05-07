import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useCreateProjectFromTemplate,
  useTemplateTasksForTemplates,
  useTemplates,
} from '../hooks/useTemplates';
import type { ProjectTemplate } from '../lib/types';
import { formatHMS } from '../lib/time';

export default function Templates() {
  const navigate = useNavigate();
  const templatesQ = useTemplates();
  const [activeTemplate, setActiveTemplate] = useState<ProjectTemplate | null>(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createProjectFromTemplate = useCreateProjectFromTemplate();
  const templateIds = useMemo(
    () => (templatesQ.data ?? []).map((template) => template.id),
    [templatesQ.data],
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
    setError(null);
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
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
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
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTemplate(null);
                setError(null);
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
                  setError('Project name is required.');
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
                  setError(
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

      {templatesQ.data && templatesQ.data.length === 0 ? (
        <div className="card text-center text-sm text-muted">
          No templates yet. Open any project and click "Save as template" to add one.
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {templatesQ.data?.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => openCreateFlow(template)}
              className="card-interactive group block w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-fg group-hover:text-accent transition-colors">
                  {template.name}
                </h3>
                {template.tag ? <span className="pill shrink-0">{template.tag}</span> : null}
              </div>
              <div className="mt-3 divider" />
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Video" value={formatHMS(template.video_length)} mono />
                <Metric label="Buffer" value={`×${template.buffer_modifier}`} />
                <Metric
                  label="Tasks"
                  value={String(taskCountByTemplate[template.id] ?? 0)}
                />
              </dl>
            </button>
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
