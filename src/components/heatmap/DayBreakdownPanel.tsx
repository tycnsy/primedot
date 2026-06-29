import { format } from 'date-fns';
import TagPill from '../TagPill';
import type { DaySummary, HeatmapColorMode } from '../../lib/heatmap';
import { formatHMS } from '../../lib/time';

interface DayBreakdownPanelProps {
  date: Date;
  summary: DaySummary;
  tagColorByName: Map<string, string>;
  colorMode?: HeatmapColorMode;
  /** Daily goal seconds keyed by tag name. */
  goalByTag?: Map<string, number>;
  /** Goal denominator for the active channel filter (summed for "all"). */
  totalGoalSeconds?: number;
  onClose: () => void;
}

function goalPercent(seconds: number, goalSeconds: number): number {
  if (goalSeconds <= 0) return 0;
  return Math.round((seconds / goalSeconds) * 100);
}

export default function DayBreakdownPanel({
  date,
  summary,
  tagColorByName,
  colorMode = 'relative',
  goalByTag,
  totalGoalSeconds = 0,
  onClose,
}: DayBreakdownPanelProps) {
  const hasActivity = summary.channels.length > 0 && summary.totalSeconds !== 0;
  const isGoal = colorMode === 'goal';

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-fg">
            {format(date, 'EEEE, MMM d, yyyy')}
          </h2>
          <p className="text-sm text-muted">
            <span className="font-medium text-fg tabular-nums">
              {formatHMS(Math.round(summary.totalSeconds))}
            </span>{' '}
            realtime across {summary.channels.length}{' '}
            {summary.channels.length === 1 ? 'channel' : 'channels'}
            {isGoal && totalGoalSeconds > 0 ? (
              <>
                {' · '}
                <span className="tabular-nums">
                  {goalPercent(summary.totalSeconds, totalGoalSeconds)}% of{' '}
                  {formatHMS(Math.round(totalGoalSeconds))} goal
                </span>
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      {!hasActivity ? (
        <p className="text-sm text-muted">No realtime progress logged on this day.</p>
      ) : (
        <div className="space-y-4">
          {summary.channels.map((channel) => {
            const channelName = channel.channel ?? 'Untagged';
            const channelKey = channel.channel ?? '__untagged__';
            const channelGoal =
              isGoal && channel.channel ? goalByTag?.get(channel.channel) ?? 0 : 0;
            const showGoal = isGoal && channelGoal > 0;
            const pct = showGoal
              ? Math.min(100, (channel.totalSeconds / channelGoal) * 100)
              : summary.totalSeconds > 0
                ? Math.max(2, (channel.totalSeconds / summary.totalSeconds) * 100)
                : 0;
            return (
              <section key={channelKey} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TagPill
                    name={channelName}
                    color={channel.channel ? tagColorByName.get(channel.channel) : null}
                  />
                  <span className="text-sm font-medium text-fg tabular-nums">
                    {formatHMS(Math.round(channel.totalSeconds))}
                    {showGoal ? (
                      <span className="ml-1 font-normal text-muted">
                        / {formatHMS(Math.round(channelGoal))} ·{' '}
                        {goalPercent(channel.totalSeconds, channelGoal)}%
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-success/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-surface/50">
                  {channel.projects.map((project) => (
                    <li
                      key={project.projectId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">
                          {project.projectName}
                        </p>
                        <p className="text-xs text-muted">
                          {project.logs.length}{' '}
                          {project.logs.length === 1 ? 'edit' : 'edits'}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted">
                        {formatHMS(Math.round(project.totalSeconds))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
