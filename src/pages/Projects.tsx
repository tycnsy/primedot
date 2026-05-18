import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCreateProject,
  useProjectTags,
  useProjects,
  useReorderProjects,
} from '../hooks/useProjects';
import ProjectForm from '../components/ProjectForm';
import { formatHMS } from '../lib/time';
import type { Project } from '../lib/types';

function reorderProjects(
  projects: Project[],
  sourceId: string,
  targetId: string,
): Project[] {
  if (sourceId === targetId) return projects;

  const sourceIndex = projects.findIndex((project) => project.id === sourceId);
  const targetIndex = projects.findIndex((project) => project.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) return projects;

  const next = [...projects];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function formatDueDateTime(iso: string | null): string {
  if (!iso) return '—';
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

export default function Projects() {
  const { data, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const projectTags = useProjectTags();
  const reorder = useReorderProjects();
  const [showForm, setShowForm] = useState(false);
  const [orderedProjects, setOrderedProjects] = useState<Project[]>([]);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);

  useEffect(() => {
    setOrderedProjects(data ?? []);
  }, [data]);

  const handleDropOnProject = (targetId: string) => {
    if (!draggingProjectId) return;
    const next = reorderProjects(orderedProjects, draggingProjectId, targetId);
    setDraggingProjectId(null);

    if (next === orderedProjects) return;

    setOrderedProjects(next);
    reorder.mutate(next.map((project) => project.id));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Workspace</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Projects
          </h1>
          <p className="max-w-md text-sm text-muted">
            Pick a project to manage tasks, set pace, and start sessions.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Close' : 'New project'}
        </button>
      </div>

      {showForm ? (
        <div className="card animate-fade-in">
          <h2 className="mb-4 text-lg font-semibold text-fg">Create project</h2>
          <ProjectForm
            tagOptions={(projectTags.data ?? []).map((tag) => tag.name)}
            onSubmit={async (input) => {
              await createProject.mutateAsync(input);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
            submitLabel="Create"
          />
        </div>
      ) : null}

      {isLoading ? <p className="text-muted">Loading projects…</p> : null}
      {error ? (
        <p className="text-danger">
          {error instanceof Error ? error.message : 'Failed to load projects.'}
        </p>
      ) : null}

      {data && data.length === 0 && !showForm ? (
        <div className="card text-center text-sm text-muted">
          No projects yet. Create your first one.
        </div>
      ) : null}

      {orderedProjects.length > 1 ? (
        <p className="text-xs text-muted">
          Drag projects to reorder them. This same order is used for pace cards.
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {orderedProjects.map((project) => (
          <li
            key={project.id}
            draggable
            onDragStart={(event) => {
              setDraggingProjectId(project.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDropOnProject(project.id);
            }}
            onDragEnd={() => setDraggingProjectId(null)}
            className={`rounded-xl ${
              draggingProjectId === project.id ? 'opacity-60' : ''
            }`}
          >
            <Link
              to={`/projects/${project.id}`}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              className="card-interactive block group"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-fg group-hover:text-accent transition-colors">
                  {project.name}
                </h3>
                <div className="flex items-center gap-2">
                  {project.tag ? <span className="pill shrink-0">{project.tag}</span> : null}
                  <span
                    className="cursor-grab text-muted active:cursor-grabbing"
                    aria-hidden="true"
                    title="Drag to reorder"
                  >
                    ≡
                  </span>
                </div>
              </div>
              <div className="mt-3 divider" />
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Video" value={formatHMS(project.video_length)} mono />
                <Metric label="Buffer" value={`×${project.buffer_modifier}`} />
                <Metric label="Due" value={formatDueDateTime(project.due_date)} />
              </dl>
            </Link>
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
