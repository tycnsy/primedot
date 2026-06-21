import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import TagPill from '../components/TagPill';
import { useProjectSeries, useProjectTags } from '../hooks/useProjects';
import { useArchivedTemplates, useRestoreTemplate } from '../hooks/useTemplates';
import { parentItems } from '../lib/parentChild';
import type { ProjectTemplate } from '../lib/types';

function templateTreeLabel(
  template: Pick<ProjectTemplate, 'name' | 'parent_id'>,
  parentNameById: Map<string, string>,
): string {
  if (!template.parent_id) return template.name;
  const parentName = parentNameById.get(template.parent_id);
  return parentName ? `${template.name} (${parentName})` : template.name;
}

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

export default function TemplatesArchive() {
  const { data: templates = [], isLoading, error } = useArchivedTemplates();
  const { data: projectTags = [] } = useProjectTags();
  const { data: projectSeries = [] } = useProjectSeries();
  const restoreTemplate = useRestoreTemplate();

  const tagColorByName = useMemo(
    () => new Map(projectTags.map((tag) => [tag.name, tag.color] as const)),
    [projectTags],
  );
  const seriesColorByName = useMemo(
    () => new Map(projectSeries.map((series) => [series.name, series.color] as const)),
    [projectSeries],
  );
  const parentNameById = useMemo(
    () =>
      new Map(
        parentItems(templates).map((template) => [template.id, template.name] as const),
      ),
    [templates],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          to="/templates"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Templates
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Archived templates</h1>
      </div>

      <div className="card space-y-2">
        {isLoading ? <p className="text-sm text-muted">Loading archived templates…</p> : null}
        {error ? (
          <p className="text-sm text-danger">
            {error instanceof Error ? error.message : 'Failed to load archived templates.'}
          </p>
        ) : null}
        {!isLoading && templates.length === 0 ? (
          <p className="text-sm text-muted">No archived templates.</p>
        ) : null}
        {templates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="border-b border-border px-2 py-2 font-semibold">Name</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Tag</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Series</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Created</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Archived on</th>
                  <th className="border-b border-border px-2 py-2 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      <Link
                        to={`/templates/${template.id}`}
                        className={`block w-full rounded-md px-1 py-1 font-medium text-fg transition-colors hover:bg-surface2/70 hover:text-accent ${
                          template.parent_id ? 'pl-4' : ''
                        }`}
                      >
                        {templateTreeLabel(template, parentNameById)}
                      </Link>
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {template.tag ? (
                        <TagPill
                          name={template.tag}
                          color={tagColorByName.get(template.tag) ?? null}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm">
                      {template.series ? (
                        <TagPill
                          name={template.series}
                          color={seriesColorByName.get(template.series) ?? null}
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {formatDateTime(template.created_at)}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-sm text-fg">
                      {formatDateTime(template.archived_at)}
                    </td>
                    <td className="border-b border-border/70 px-2 py-2 text-right">
                      <button
                        type="button"
                        className="btn-ghost !h-8 !px-2.5 text-xs"
                        onClick={async () => {
                          await restoreTemplate.mutateAsync(template.id);
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
