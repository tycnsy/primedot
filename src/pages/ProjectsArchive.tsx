import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import TagPill from '../components/TagPill';
import {
  useArchivedProjects,
  useProjectSeries,
  useProjectTags,
  useRestoreProject,
} from '../hooks/useProjects';

function formatDateTime(iso: string | null): string {
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

export default function ProjectsArchive() {
  const { data: projects = [], isLoading, error } = useArchivedProjects();
  const { data: projectTags = [] } = useProjectTags();
  const { data: projectSeries = [] } = useProjectSeries();
  const restoreProject = useRestoreProject();

  const tagColorByName = useMemo(
    () => new Map(projectTags.map((tag) => [tag.name, tag.color] as const)),
    [projectTags],
  );
  const seriesColorByName = useMemo(
    () => new Map(projectSeries.map((series) => [series.name, series.color] as const)),
    [projectSeries],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Projects
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Archived projects</h1>
      </div>

      <div className="card space-y-2">
        {isLoading ? <p className="text-sm text-muted">Loading archived projects…</p> : null}
        {error ? (
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : 'Failed to load archived projects.'}
          </p>
        ) : null}
        {!isLoading && projects.length === 0 ? (
          <p className="text-sm text-muted">No archived projects.</p>
        ) : null}
        {projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="border-b border-border px-2 py-2 font-semibold">Name</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Tag</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Series</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Due</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Archived on</th>
                  <th className="border-b border-border px-2 py-2 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      <Link
                        to={`/projects/${project.id}`}
                        className="block w-full rounded-md px-1 py-1 font-medium text-fg transition-colors hover:bg-surface2/70 hover:text-accent"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {project.tag ? (
                        <TagPill
                          name={project.tag}
                          color={tagColorByName.get(project.tag) ?? null}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {project.series ? (
                        <TagPill
                          name={project.series}
                          color={seriesColorByName.get(project.series) ?? null}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {formatDateTime(project.due_date)}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {formatDateTime(project.archived_at)}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-right">
                      <button
                        type="button"
                        className="btn-ghost !h-8 !px-2.5 text-xs"
                        onClick={async () => {
                          await restoreProject.mutateAsync(project.id);
                        }}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
