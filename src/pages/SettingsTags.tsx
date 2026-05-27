import { Link } from 'react-router-dom';
import ColorTagEditor from '../components/ColorTagEditor';
import {
  useCreateProjectTag,
  useDeleteProjectTag,
  useProjectTags,
  useUpdateProjectTag,
} from '../hooks/useProjects';

export default function SettingsTags() {
  const tagsQ = useProjectTags();
  const createTag = useCreateProjectTag();
  const updateTag = useUpdateProjectTag();
  const deleteTag = useDeleteProjectTag();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Tags</h1>
          <p className="max-w-lg text-sm text-muted">
            Create and manage reusable project tags. You can rename tags and assign colors.
          </p>
        </div>
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
      </div>

      <ColorTagEditor
        noun="tag"
        items={tagsQ.data ?? []}
        isLoading={tagsQ.isLoading}
        error={tagsQ.error}
        onCreate={async (input) => {
          await createTag.mutateAsync(input);
        }}
        onUpdate={async (input) => {
          await updateTag.mutateAsync(input);
        }}
        onDelete={async (input) => {
          await deleteTag.mutateAsync(input);
        }}
      />
    </div>
  );
}
