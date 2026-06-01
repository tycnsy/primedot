import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ColorTagEditor from '../components/ColorTagEditor';
import {
  useAllProjectsIncludingArchived,
  useArchiveProjectSeries,
  useCreateProjectSeries,
  useDeleteProjectSeries,
  useProjectSeries,
  useProjectTags,
  useRestoreProjectSeries,
  useUpdateProjectSeries,
} from '../hooks/useProjects';

export default function SettingsSeries() {
  const seriesQ = useProjectSeries();
  const tagsQ = useProjectTags();
  const projectsQ = useAllProjectsIncludingArchived();
  const createSeries = useCreateProjectSeries();
  const updateSeries = useUpdateProjectSeries();
  const deleteSeries = useDeleteProjectSeries();
  const archiveSeries = useArchiveProjectSeries();
  const restoreSeries = useRestoreProjectSeries();

  const relatedTagOptions = useMemo(
    () =>
      (tagsQ.data ?? [])
        .filter((tag) => !tag.archived_at)
        .map((tag) => tag.name),
    [tagsQ.data],
  );

  const usageById = useMemo(() => {
    const countByName = new Map<string, number>();
    for (const project of projectsQ.data ?? []) {
      if (!project.series) continue;
      countByName.set(project.series, (countByName.get(project.series) ?? 0) + 1);
    }
    const map = new Map<string, number>();
    for (const series of seriesQ.data ?? []) {
      map.set(series.id, countByName.get(series.name) ?? 0);
    }
    return map;
  }, [projectsQ.data, seriesQ.data]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Series</h1>
          <p className="max-w-lg text-sm text-muted">
            Create and manage reusable project series. Relate a series to a tag so it only
            appears for projects with that tag. Archive series to hide them from dropdowns
            while keeping them on existing projects.
          </p>
        </div>
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
      </div>

      <ColorTagEditor
        noun="series"
        items={seriesQ.data ?? []}
        isLoading={seriesQ.isLoading}
        error={seriesQ.error}
        relatedTagOptions={relatedTagOptions}
        usageById={usageById}
        onCreate={async (input) => {
          await createSeries.mutateAsync(input);
        }}
        onUpdate={async (input) => {
          await updateSeries.mutateAsync(input);
        }}
        onDelete={async (input) => {
          await deleteSeries.mutateAsync(input);
        }}
        onArchive={async (input) => {
          await archiveSeries.mutateAsync(input);
        }}
        onRestore={async (input) => {
          await restoreSeries.mutateAsync(input);
        }}
      />
    </div>
  );
}
