import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useArchiveProject,
  useCreateProject,
  useProjectSeries,
  useProjectTags,
  useProjects,
  useUpdateProject,
} from '../hooks/useProjects';
import ProjectsTable from '../components/ProjectsTable';
import ProjectForm from '../components/ProjectForm';
import TagPill from '../components/TagPill';
import {
  sortProjects,
  type ProjectGroupBy,
  type ProjectSortBy,
} from '../lib/projectGrouping';
import { formatHMS } from '../lib/time';

type ProjectsViewTab = 'cards' | 'table';

const VIEW_STORAGE_KEY = 'prime:projects-view';

function readProjectsViewPref(): {
  tab: ProjectsViewTab;
  groupBy: ProjectGroupBy;
  sortBy: ProjectSortBy;
} {
  if (typeof window === 'undefined') {
    return { tab: 'cards', groupBy: 'none', sortBy: 'due_date' };
  }
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return { tab: 'cards', groupBy: 'none', sortBy: 'due_date' };
    const parsed = JSON.parse(raw) as {
      tab?: ProjectsViewTab;
      groupBy?: ProjectGroupBy;
      sortBy?: ProjectSortBy;
    };
    return {
      tab: parsed.tab === 'table' ? 'table' : 'cards',
      groupBy:
        parsed.groupBy === 'week' ||
        parsed.groupBy === 'month' ||
        parsed.groupBy === 'tag' ||
        parsed.groupBy === 'series'
          ? parsed.groupBy
          : 'none',
      sortBy: parsed.sortBy === 'series' ? 'series' : 'due_date',
    };
  } catch {
    return { tab: 'cards', groupBy: 'none', sortBy: 'due_date' };
  }
}

function writeProjectsViewPref(pref: {
  tab: ProjectsViewTab;
  groupBy: ProjectGroupBy;
  sortBy: ProjectSortBy;
}) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // ignore localStorage write failures
  }
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
  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();
  const projectTags = useProjectTags();
  const projectSeries = useProjectSeries();
  const [showForm, setShowForm] = useState(false);
  const [viewPref, setViewPref] = useState(readProjectsViewPref);

  const projects = useMemo(
    () => sortProjects(data ?? [], viewPref.sortBy),
    [data, viewPref.sortBy],
  );
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
  const tagOptions = useMemo(
    () => (projectTags.data ?? []).map((tag) => tag.name),
    [projectTags.data],
  );
  const seriesOptions = useMemo(
    () => (projectSeries.data ?? []).map((series) => series.name),
    [projectSeries.data],
  );

  const setTab = (tab: ProjectsViewTab) => {
    setViewPref((prev) => {
      const next = { ...prev, tab };
      writeProjectsViewPref(next);
      return next;
    });
  };

  const setGroupBy = (groupBy: ProjectGroupBy) => {
    setViewPref((prev) => {
      const next = { ...prev, groupBy };
      writeProjectsViewPref(next);
      return next;
    });
  };

  const setSortBy = (sortBy: ProjectSortBy) => {
    setViewPref((prev) => {
      const next = { ...prev, sortBy };
      writeProjectsViewPref(next);
      return next;
    });
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
      <div className="flex justify-end">
        <Link to="/projects/archive" className="btn-ghost">
          View archive
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={viewPref.tab === 'cards' ? 'btn-secondary' : 'btn-ghost'}
          onClick={() => setTab('cards')}
        >
          Cards
        </button>
        <button
          type="button"
          className={viewPref.tab === 'table' ? 'btn-secondary' : 'btn-ghost'}
          onClick={() => setTab('table')}
        >
          Table
        </button>
      </div>

      {showForm ? (
        <div className="card animate-fade-in">
          <h2 className="mb-4 text-lg font-semibold text-fg">Create project</h2>
          <ProjectForm
            tagOptions={tagOptions}
            seriesOptions={seriesOptions}
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

      {viewPref.tab === 'cards' ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="rounded-xl">
              <Link to={`/projects/${project.id}`} className="card-interactive block group">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-fg transition-colors group-hover:text-accent">
                    {project.name}
                  </h3>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {project.tag ? (
                      <TagPill
                        name={project.tag}
                        color={tagColorByName.get(project.tag) ?? null}
                      />
                    ) : null}
                    {project.series ? (
                      <TagPill
                        name={project.series}
                        color={seriesColorByName.get(project.series) ?? null}
                      />
                    ) : null}
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
      ) : (
        <ProjectsTable
          projects={projects}
          groupBy={viewPref.groupBy}
          sortBy={viewPref.sortBy}
          onGroupByChange={setGroupBy}
          onSortByChange={setSortBy}
          tagColorByName={tagColorByName}
          seriesColorByName={seriesColorByName}
          tagOptions={tagOptions}
          seriesOptions={seriesOptions}
          onUpdateProject={async (id, patch) => {
            await updateProject.mutateAsync({ id, patch });
          }}
          onArchiveProject={async (id) => {
            if (!confirm('Archive this project?')) return;
            await archiveProject.mutateAsync(id);
          }}
        />
      )}
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
