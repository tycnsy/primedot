import { Link } from 'react-router-dom';
import ColorTagEditor from '../components/ColorTagEditor';
import {
  useCreateProjectSeries,
  useDeleteProjectSeries,
  useProjectSeries,
  useUpdateProjectSeries,
} from '../hooks/useProjects';

export default function SettingsSeries() {
  const seriesQ = useProjectSeries();
  const createSeries = useCreateProjectSeries();
  const updateSeries = useUpdateProjectSeries();
  const deleteSeries = useDeleteProjectSeries();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Series</h1>
          <p className="max-w-lg text-sm text-muted">
            Create and manage reusable project series. Use series to sort and group related
            projects together.
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
        onCreate={async (input) => {
          await createSeries.mutateAsync(input);
        }}
        onUpdate={async (input) => {
          await updateSeries.mutateAsync(input);
        }}
        onDelete={async (input) => {
          await deleteSeries.mutateAsync(input);
        }}
      />
    </div>
  );
}
