import { subDays } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DayBreakdownPanel from '../components/heatmap/DayBreakdownPanel';
import HeatmapGrid from '../components/heatmap/HeatmapGrid';
import RealtimeLogsTab from '../components/heatmap/RealtimeLogsTab';
import { useHeatmapSettings, useUpsertHeatmapSettings } from '../hooks/useHeatmapSettings';
import { useProjectTags } from '../hooks/useProjects';
import { useTagGoals } from '../hooks/useTagGoals';
import {
  ALL_CHANNELS,
  HEATMAP_COLOR_MODES,
  HEATMAP_VIEWS,
  UNTAGGED_CHANNEL,
  dailyGoalSecondsForChannel,
  localDayKey,
  logChannel,
  resolveHeatmapColorMode,
  resolveHeatmapView,
  summarizeDay,
  writePersistedHeatmapColorMode,
  writePersistedHeatmapView,
  type HeatmapColorMode,
  type HeatmapDayCell,
  type HeatmapView,
} from '../lib/heatmap';
import { useRealtimeLogs } from '../hooks/useRealtimeLogs';

const DEFAULT_LIMIT = 250;
const HEATMAP_WEEKS = 52;

export default function HeatmapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') === 'logs' ? 'logs' : 'heatmap';
  const channelFromUrl = searchParams.get('channel') ?? ALL_CHANNELS;
  const [activeTab, setActiveTab] = useState<'heatmap' | 'logs'>(tabFromUrl);
  const [view, setView] = useState<HeatmapView>(() => resolveHeatmapView(searchParams.get('view')));
  const [colorMode, setColorMode] = useState<HeatmapColorMode>(() =>
    resolveHeatmapColorMode(searchParams.get('calc')),
  );
  const [channel, setChannel] = useState<string>(channelFromUrl);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [rollingOffset, setRollingOffset] = useState(0);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    const urlView = searchParams.get('view');
    const resolved = resolveHeatmapView(urlView);
    setView(resolved);
    writePersistedHeatmapView(resolved);

    if (urlView === 'daily' || (!urlView && resolved !== 'yearly')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('view', resolved);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const resolved = resolveHeatmapColorMode(searchParams.get('calc'));
    setColorMode(resolved);
    writePersistedHeatmapColorMode(resolved);

    if (!searchParams.get('calc') && resolved !== 'relative') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('calc', resolved);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setChannel(channelFromUrl);
  }, [channelFromUrl]);

  const handleColorModeChange = (nextMode: HeatmapColorMode) => {
    setColorMode(nextMode);
    writePersistedHeatmapColorMode(nextMode);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('calc', nextMode);
      return next;
    });
  };

  const handleViewChange = (nextView: HeatmapView) => {
    setView(nextView);
    setSelectedDateKey(null);
    setRollingOffset(0);
    writePersistedHeatmapView(nextView);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', nextView);
      return next;
    });
  };

  const handleChannelChange = (nextChannel: string) => {
    setChannel(nextChannel);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextChannel === ALL_CHANNELS) {
        next.delete('channel');
      } else {
        next.set('channel', nextChannel);
      }
      return next;
    });
  };

  const handleSelectDay = (cell: HeatmapDayCell) => {
    if (cell.preStart) return;
    setSelectedDateKey((current) => (current === cell.dateKey ? null : cell.dateKey));
  };

  const handleShiftDays = (delta: number) => {
    setRollingOffset((current) => current + delta);
    setSelectedDateKey(null);
  };

  const heatmapSince = useMemo(
    () => subDays(new Date(), HEATMAP_WEEKS * 7).toISOString(),
    [],
  );

  const heatmapLogsQuery = useRealtimeLogs({ since: heatmapSince });
  const logsQuery = useRealtimeLogs({ limit });
  const tagsQuery = useProjectTags();
  const goalsQuery = useTagGoals();
  const settingsQuery = useHeatmapSettings();
  const upsertSettings = useUpsertHeatmapSettings();

  const yearlyStartDate = useMemo(() => {
    const raw = settingsQuery.data?.yearly_start_date;
    if (!raw) return null;
    return new Date(`${raw}T12:00:00`);
  }, [settingsQuery.data?.yearly_start_date]);

  const allHeatmapLogs = useMemo(
    () => heatmapLogsQuery.data ?? [],
    [heatmapLogsQuery.data],
  );

  const tagColorByName = useMemo(
    () => new Map((tagsQuery.data ?? []).map((tag) => [tag.name, tag.color] as const)),
    [tagsQuery.data],
  );

  const goalByTag = useMemo(
    () =>
      new Map(
        (goalsQuery.data ?? []).map(
          (goal) => [goal.tag_name, Number(goal.daily_goal_seconds)] as const,
        ),
      ),
    [goalsQuery.data],
  );

  const goalSecondsPerDay = useMemo(
    () => (colorMode === 'goal' ? dailyGoalSecondsForChannel(goalByTag, channel) : 0),
    [colorMode, goalByTag, channel],
  );

  const goalMissing = colorMode === 'goal' && goalSecondsPerDay <= 0;

  const channelInfo = useMemo(() => {
    const tags = new Set<string>();
    let hasUntagged = false;
    for (const log of allHeatmapLogs) {
      const ch = logChannel(log);
      if (ch) tags.add(ch);
      else hasUntagged = true;
    }
    return {
      tags: [...tags].sort((a, b) => a.localeCompare(b)),
      hasUntagged,
    };
  }, [allHeatmapLogs]);

  const filteredLogs = useMemo(() => {
    if (channel === ALL_CHANNELS) return allHeatmapLogs;
    if (channel === UNTAGGED_CHANNEL) {
      return allHeatmapLogs.filter((log) => logChannel(log) === null);
    }
    return allHeatmapLogs.filter((log) => logChannel(log) === channel);
  }, [allHeatmapLogs, channel]);

  const selectedDay = useMemo(() => {
    if (!selectedDateKey) return null;
    const dayLogs = filteredLogs.filter(
      (log) => localDayKey(new Date(log.logged_at)) === selectedDateKey,
    );
    return {
      date: new Date(`${selectedDateKey}T12:00:00`),
      summary: summarizeDay(dayLogs),
    };
  }, [selectedDateKey, filteredLogs]);

  const handleTabChange = (nextTab: 'heatmap' | 'logs') => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Realtime heatmap
        </h1>
        <p className="text-sm text-muted">
          GitHub-style view of estimated realtime progress across all projects.
          Only progress changes affect the heatmap; other edits appear in Logs.
        </p>
      </div>

      <div className="segmented">
        <button
          type="button"
          data-active={activeTab === 'heatmap'}
          onClick={() => handleTabChange('heatmap')}
        >
          Heatmap
        </button>
        <button
          type="button"
          data-active={activeTab === 'logs'}
          onClick={() => handleTabChange('logs')}
        >
          Logs
        </button>
      </div>

      {activeTab === 'heatmap' ? (
        <>
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="segmented" role="group" aria-label="Calculation mode">
                  {HEATMAP_COLOR_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      data-active={colorMode === mode.value}
                      onClick={() => handleColorModeChange(mode.value)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <Link to="/heatmap/goals" className="btn-ghost px-3 py-1.5 text-sm">
                  Manage goals
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted">
                  Channel
                  <select
                    className="input py-1"
                    value={channel}
                    onChange={(e) => handleChannelChange(e.target.value)}
                  >
                    <option value={ALL_CHANNELS}>All channels</option>
                    {channelInfo.tags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                    {channelInfo.hasUntagged ? (
                      <option value={UNTAGGED_CHANNEL}>Untagged</option>
                    ) : null}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted">
                  View
                  <select
                    className="input py-1"
                    value={view}
                    onChange={(e) => handleViewChange(e.target.value as HeatmapView)}
                  >
                    {HEATMAP_VIEWS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {view === 'yearly' ? (
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Start date
                    <input
                      type="date"
                      className="input py-1"
                      value={settingsQuery.data?.yearly_start_date ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        void upsertSettings.mutateAsync({
                          yearlyStartDate: value || null,
                        });
                      }}
                      disabled={upsertSettings.isPending}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <p className="text-sm text-muted">
              {colorMode === 'goal'
                ? 'Colors show progress toward each day’s goal. Click any day for a breakdown.'
                : 'Colors are relative to your busiest day in range. Click any day for a breakdown.'}
            </p>

            {goalMissing ? (
              <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
                No goal set for this channel.{' '}
                <Link to="/heatmap/goals" className="font-medium underline">
                  Set a daily goal
                </Link>{' '}
                to color days by progress.
              </p>
            ) : null}

            {heatmapLogsQuery.isLoading ? (
              <p className="text-muted">Loading heatmap…</p>
            ) : heatmapLogsQuery.error ? (
              <p className="text-danger">{heatmapLogsQuery.error.message}</p>
            ) : (
              <HeatmapGrid
                logs={filteredLogs}
                weeks={HEATMAP_WEEKS}
                view={view}
                colorMode={colorMode}
                goalSecondsPerDay={goalSecondsPerDay}
                selectedDateKey={selectedDateKey}
                onSelectDay={handleSelectDay}
                yearlyStartDate={yearlyStartDate}
                rollingOffsetDays={rollingOffset}
                onShiftDays={handleShiftDays}
              />
            )}
          </div>

          {selectedDay ? (
            <DayBreakdownPanel
              date={selectedDay.date}
              summary={selectedDay.summary}
              tagColorByName={tagColorByName}
              colorMode={colorMode}
              goalByTag={goalByTag}
              totalGoalSeconds={goalSecondsPerDay}
              onClose={() => setSelectedDateKey(null)}
            />
          ) : null}
        </>
      ) : (
        <div className="card">
          <RealtimeLogsTab
            logs={logsQuery.data ?? []}
            isLoading={logsQuery.isLoading}
            error={logsQuery.error}
            limit={limit}
            onLimitChange={setLimit}
          />
        </div>
      )}
    </div>
  );
}
