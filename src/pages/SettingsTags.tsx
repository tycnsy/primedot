import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import ColorTagEditor from '../components/ColorTagEditor';
import {
  useAllProjectsIncludingArchived,
  useArchiveProjectTag,
  useCreateProjectTag,
  useDeleteProjectTag,
  useProjectTags,
  useRestoreProjectTag,
  useUpdateProjectTag,
} from '../hooks/useProjects';

export default function SettingsTags() {
  const tagsQ = useProjectTags();
  const projectsQ = useAllProjectsIncludingArchived();
  const createTag = useCreateProjectTag();
  const updateTag = useUpdateProjectTag();
  const deleteTag = useDeleteProjectTag();
  const archiveTag = useArchiveProjectTag();
  const restoreTag = useRestoreProjectTag();

  const usageById = useMemo(() => {
    const countByName = new Map<string, number>();
    for (const project of projectsQ.data ?? []) {
      if (!project.tag) continue;
      countByName.set(project.tag, (countByName.get(project.tag) ?? 0) + 1);
    }
    const map = new Map<string, number>();
    for (const tag of tagsQ.data ?? []) {
      map.set(tag.id, countByName.get(tag.name) ?? 0);
    }
    return map;
  }, [projectsQ.data, tagsQ.data]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Tags</h1>
          <p className="max-w-lg text-sm text-muted">
            Create and manage reusable project tags. Archive tags to hide them from dropdowns
            while keeping them on existing projects.
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
        usageById={usageById}
        onCreate={async (input) => {
          await createTag.mutateAsync(input);
        }}
        onUpdate={async (input) => {
          await updateTag.mutateAsync(input);
        }}
        onDelete={async (input) => {
          await deleteTag.mutateAsync(input);
        }}
        onArchive={async (input) => {
          await archiveTag.mutateAsync(input);
        }}
        onRestore={async (input) => {
          await restoreTag.mutateAsync(input);
        }}
      />
    </div>
  );
}
