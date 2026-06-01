import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GoalTypeBadge, LogProgressModal, NewGoalModal, TagChip } from '../components/goals';
import RingProgress from '../components/habits/RingProgress';
import {
  accumulationStats,
  milestoneStats,
  trendStats,
  useGoalsPreferences,
  useGoalsStore,
} from '../features/goals';
import type {
  AccumulationGoal,
  DailyGoal,
  LogEntry,
  LongGoal,
  Milestone,
  MilestoneGoal,
  TrendGoal,
} from '../features/goals';

type DetailTab = 'overview' | 'log' | 'related' | 'settings';

const numberFormatter = new Intl.NumberFormat();
const dateOnlyLongFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
const dateOnlyShortFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatValue(value: number, unit: string): string {
  if (unit === '$') return `$${numberFormatter.format(value)}`;
  return `${numberFormatter.format(value)}${unit}`;
}

function parseDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function formatDateOnlyLong(isoDate: string): string {
  return dateOnlyLongFormatter.format(parseDateOnly(isoDate));
}

function formatLogDateTime(iso: string, includeYear: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function toLocalDateTimeInputValue(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function sortLogsNewestFirst(logs: LogEntry[]): LogEntry[] {
  return [...logs].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export default function GoalDetailLong() {
  const navigate = useNavigate();
  const { goalId } = useParams<{ goalId: string }>();
  const {
    longGoals,
    tags,
    goalById,
    tagById,
    toggleMilestone,
    addLog,
    updateLog,
    deleteLog,
    updateLongGoal,
    archiveLongGoal,
  } = useGoalsStore();
  const {
    density,
    setDensity,
    indexLayout,
    setIndexLayout,
    showPaceLine,
    setShowPaceLine,
  } = useGoalsPreferences();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const goal = longGoals.find((item) => item.id === goalId);
  const goalTags = useMemo(
    () => (goal?.tags ?? []).map((id) => tagById(id)).filter((tag) => !!tag),
    [goal?.tags, tagById],
  );
  const relatedGoals = useMemo(
    () =>
      (goal?.relatedGoalIds ?? [])
        .map((id) => goalById(id))
        .filter((item): item is LongGoal | DailyGoal => !!item),
    [goal?.relatedGoalIds, goalById],
  );

  if (!goal) {
    return (
      <div className="space-y-3">
        <Link
          to="/goals"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Goals
        </Link>
        <p className="text-sm text-muted">Long-term goal not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/goals"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Goals
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <GoalTypeBadge type={goal.type} />
            {goalTags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{goal.name}</h1>
          {goal.description ? <p className="text-sm text-muted">{goal.description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setIsEditModalOpen(true)}>
            Edit
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              const confirmed = window.confirm(`Archive "${goal.name}"?`);
              if (!confirmed) return;
              await archiveLongGoal(goal.id);
              navigate('/goals');
            }}
          >
            Archive
          </button>
          <button type="button" className="btn-primary" onClick={() => setIsLogModalOpen(true)}>
            + Log progress
          </button>
        </div>
      </div>

      <HeroCard goal={goal} />

      <div className="segmented">
        {(['overview', 'log', 'related', 'settings'] as DetailTab[]).map((item) => (
          <button
            key={item}
            type="button"
            data-active={tab === item}
            onClick={() => setTab(item)}
            className="capitalize"
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            {goal.type === 'trend' ? <TrendBody goal={goal} showPaceLine={showPaceLine} /> : null}
            {goal.type === 'accumulation' ? <AccumulationBody goal={goal} /> : null}
            {goal.type === 'milestone' ? (
              <MilestoneBody
                goal={goal}
                onToggle={(milestoneId) => toggleMilestone(goal.id, milestoneId)}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <RelatedGoalsCard related={relatedGoals} onOpen={navigate} />
            <RecentLogCard goal={goal} />
          </div>
        </div>
      ) : null}

      {tab === 'log' ? (
        <FullLogCard
          goal={goal}
          onLog={() => setIsLogModalOpen(true)}
          onUpdateLog={async (logId, patch) => {
            await updateLog(logId, patch);
          }}
          onDeleteLog={async (logId) => {
            await deleteLog(logId);
          }}
        />
      ) : null}
      {tab === 'related' ? <RelatedGoalsCard related={relatedGoals} onOpen={navigate} full /> : null}
      {tab === 'settings' ? (
        <div className="card space-y-4">
          <div className="space-y-1">
            <p className="label">Density</p>
            <div className="segmented">
              {(['cozy', 'comfortable', 'compact'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={density === item}
                  className="capitalize"
                  onClick={() => setDensity(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="label">Index layout</p>
            <div className="segmented">
              {(['grid', 'list'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={indexLayout === item}
                  className="capitalize"
                  onClick={() => setIndexLayout(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              showPaceLine
                ? 'border-border bg-surface2 text-fg'
                : 'border-border/70 text-muted hover:text-fg'
            }`}
            onClick={() => setShowPaceLine(!showPaceLine)}
          >
            Show pace line on charts: {showPaceLine ? 'On' : 'Off'}
          </button>
        </div>
      ) : null}

      <LogProgressModal
        open={isLogModalOpen}
        goal={goal}
        onClose={() => setIsLogModalOpen(false)}
        onSave={({ goalId: saveGoalId, value, note, at, kind, delta }) => {
          addLog(saveGoalId, { value, note, at, kind, delta });
        }}
      />
      <NewGoalModal
        open={isEditModalOpen}
        mode="edit"
        initialGoal={goal}
        tags={tags}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (nextGoal) => {
          await updateLongGoal(goal.id, nextGoal);
        }}
      />
    </div>
  );
}

function HeroCard({ goal }: { goal: LongGoal }) {
  if (goal.type === 'trend') {
    const stats = trendStats(goal);
    return (
      <div className="card flex items-center justify-between gap-4">
        <div>
          <div className="text-[32px] font-semibold tracking-tight tabular-nums text-fg">
            {formatValue(stats.last, goal.unit)}
          </div>
          <p className="text-xs text-muted">
            start {formatValue(goal.startValue, goal.unit)} {'->'} target{' '}
            {formatValue(goal.targetValue, goal.unit)} by{' '}
            {formatDateOnlyLong(goal.targetDate)}
          </p>
        </div>
        <PacePill
          text={`${stats.onPace ? 'Ahead of pace' : 'Behind pace'} · ${stats.aheadBy.toFixed(1)}${goal.unit}`}
          positive={stats.onPace}
        />
      </div>
    );
  }

  if (goal.type === 'accumulation') {
    const stats = accumulationStats(goal);
    return (
      <div className="card flex items-center justify-between gap-4">
        <div>
          <div className="text-[32px] font-semibold tracking-tight tabular-nums text-fg">
            {formatValue(stats.total, goal.unit)}
          </div>
          <p className="text-xs text-muted">
            of {formatValue(goal.targetTotal, goal.unit)} by{' '}
            {formatDateOnlyLong(goal.targetDate)}
          </p>
        </div>
        <div className="text-right">
          <RingProgress percent={stats.pct} size={72} />
          <p className="mt-1 text-xs text-muted">{stats.daysLeft}d left</p>
        </div>
      </div>
    );
  }

  const stats = milestoneStats(goal);
  return (
    <div className="card flex items-center justify-between gap-4">
      <div>
        <div className="text-[32px] font-semibold tracking-tight tabular-nums text-fg">
          {stats.done}
          <span className="text-lg font-medium text-muted">/{stats.total} milestones</span>
        </div>
        <p className="text-xs text-muted">
          target {formatDateOnlyLong(goal.targetDate)}
        </p>
      </div>
      <div className="text-right">
        <RingProgress percent={stats.pct} size={72} />
        <p className="mt-1 text-xs text-muted">{stats.next ? `next: ${stats.next.name}` : 'all done'}</p>
      </div>
    </div>
  );
}

function PacePill({ text, positive }: { text: string; positive: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        positive
          ? 'bg-[rgb(var(--success)/0.12)] text-[rgb(var(--success))]'
          : 'bg-[rgb(var(--warn)/0.12)] text-[rgb(var(--warn))]'
      }`}
    >
      {text}
    </span>
  );
}

function TrendBody({ goal, showPaceLine }: { goal: TrendGoal; showPaceLine: boolean }) {
  const stats = trendStats(goal);
  return (
    <>
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-fg">Progress</h3>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-accent" />
              actual
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-muted" />
              pace
            </span>
            <span>hover dots for notes</span>
          </div>
        </div>
        <TrendChart goal={goal} height={280} showPaceLine={showPaceLine} />
      </div>
      <div className="card grid gap-3 sm:grid-cols-4">
        <StatCell label="Latest" value={formatValue(stats.last, goal.unit)} accent />
        <StatCell
          label="Change"
          value={`${stats.progressDelta >= 0 ? '+' : ''}${stats.progressDelta.toFixed(1)}${goal.unit}`}
        />
        <StatCell label="Logs" value={String(goal.logs.length)} />
        <StatCell label="Days in" value={`${stats.daysIn}/${stats.days}`} />
      </div>
    </>
  );
}

function AccumulationBody({ goal }: { goal: AccumulationGoal }) {
  const stats = accumulationStats(goal);
  const bars = useMemo(() => {
    const weeks = Array.from({ length: 12 }, () => 0);
    const now = Date.now();
    goal.logs.forEach((log) => {
      const weekAge = Math.floor((now - new Date(log.at).getTime()) / (86_400_000 * 7));
      const idx = 11 - weekAge;
      if (idx >= 0 && idx < 12) weeks[idx] += log.value ?? 0;
    });
    return weeks;
  }, [goal.logs]);

  return (
    <div className="card grid gap-6 lg:grid-cols-[auto_1fr]">
      <Donut
        percent={stats.pct}
        label={`${Math.round(stats.pct)}%`}
        sublabel={stats.remaining > 0 ? `${formatValue(stats.remaining, goal.unit)} to go` : 'Complete'}
      />
      <div className="space-y-4">
        <div>
          <p className="label mb-2">Weekly contributions (last 12w)</p>
          <MiniBars values={bars} width={320} height={56} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCell label="To go" value={formatValue(stats.remaining, goal.unit)} accent />
          <StatCell label="Days left" value={String(stats.daysLeft)} />
          <StatCell label="Pace" value={`${stats.pacePerDay.toFixed(1)}/day`} />
        </div>
      </div>
    </div>
  );
}

function MilestoneBody({
  goal,
  onToggle,
}: {
  goal: MilestoneGoal;
  onToggle: (milestoneId: string) => void;
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Milestones</h3>
        <span className="text-xs text-muted">tap to toggle · drag to reorder</span>
      </div>
      <MilestoneList milestones={goal.milestones} onToggle={onToggle} />
    </div>
  );
}

function MilestoneList({
  milestones,
  onToggle,
}: {
  milestones: Milestone[];
  onToggle: (milestoneId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {milestones.map((milestone, index) => (
        <div
          key={milestone.id}
          className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2 ${
            milestone.done ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface2/40'
          }`}
        >
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              milestone.done ? 'bg-accent text-white' : 'bg-surface text-muted ring-1 ring-inset ring-border'
            }`}
          >
            {milestone.done ? '✓' : index + 1}
          </span>
          <button
            type="button"
            className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition ${
              milestone.done
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface2 text-transparent'
            }`}
            onClick={() => onToggle(milestone.id)}
            aria-label={`Toggle ${milestone.name}`}
          >
            ✓
          </button>
          <div className="min-w-0">
            <p className={`truncate text-sm font-medium ${milestone.done ? 'line-through text-muted' : 'text-fg'}`}>
              {milestone.name}
            </p>
            <p className="text-xs text-muted">
              {milestone.dueDate
                ? `Due ${formatDateOnlyLong(milestone.dueDate)}`
                : 'No due date'}
              {milestone.doneAt ? ` · completed ${relativeDate(milestone.doneAt)}` : ''}
            </p>
          </div>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs">
            ...
          </button>
        </div>
      ))}
    </div>
  );
}

function RelatedGoalsCard({
  related,
  onOpen,
  full = false,
}: {
  related: Array<LongGoal | DailyGoal>;
  onOpen: ReturnType<typeof useNavigate>;
  full?: boolean;
}) {
  if (related.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-muted">No related goals yet.</p>
      </div>
    );
  }

  const visible = full ? related : related.slice(0, 5);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Related goals</h3>
        <span className="text-xs text-muted">navigation only</span>
      </div>
      <div className="space-y-2">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onOpen('type' in item ? `/goals/long/${item.id}` : `/goals/daily/${item.id}`)
            }
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface2/40 px-2.5 py-2 text-left transition hover:bg-surface2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{item.name}</span>
              <span className="block text-[11px] text-muted">
                {'type' in item ? item.type : `${item.kind} · ${item.schedule}`}
              </span>
            </span>
            <span className="text-xs text-muted">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecentLogCard({ goal }: { goal: LongGoal }) {
  const recent = sortLogsNewestFirst(goal.logs).slice(0, 5);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Recent log</h3>
        <span className="text-xs text-muted">{goal.logs.length} entries</span>
      </div>
      <div className="space-y-1.5">
        {recent.map((log) => (
          <LogRow key={log.id} log={log} unit={goal.type === 'milestone' ? undefined : goal.unit} />
        ))}
        {recent.length === 0 ? <p className="text-sm text-muted">No entries yet.</p> : null}
      </div>
    </div>
  );
}

function FullLogCard({
  goal,
  onLog,
  onUpdateLog,
  onDeleteLog,
}: {
  goal: LongGoal;
  onLog: () => void;
  onUpdateLog: (logId: string, patch: { at?: string; note?: string }) => Promise<void>;
  onDeleteLog: (logId: string) => Promise<void>;
}) {
  const rows = sortLogsNewestFirst(goal.logs);
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Log history · {rows.length} entries</h3>
        <button type="button" className="btn-secondary" onClick={onLog}>
          + New entry
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((log) => (
          <LogRow
            key={log.id}
            log={log}
            unit={goal.type === 'milestone' ? undefined : goal.unit}
            detailed
            onUpdate={onUpdateLog}
            onDelete={onDeleteLog}
          />
        ))}
      </div>
    </div>
  );
}

function LogRow({
  log,
  unit,
  detailed = false,
  onUpdate,
  onDelete,
}: {
  log: LogEntry;
  unit?: string;
  detailed?: boolean;
  onUpdate?: (logId: string, patch: { at?: string; note?: string }) => Promise<void>;
  onDelete?: (logId: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDateTime, setEditDateTime] = useState(toLocalDateTimeInputValue(log.at));
  const [editNote, setEditNote] = useState(log.note ?? '');
  const isAdjustment = log.kind === 'adjustment' && typeof log.delta === 'number';
  const formattedValue =
    typeof log.value === 'number' ? `${numberFormatter.format(log.value)}${unit ?? ''}` : '—';
  const formattedDelta =
    isAdjustment && typeof log.delta === 'number'
      ? `${log.delta >= 0 ? '+' : ''}${numberFormatter.format(log.delta)}${unit ?? ''}`
      : null;

  return (
    <div className="rounded-lg bg-surface2/50 px-2.5 py-2">
      <div
        className={`grid gap-2 ${
          detailed
            ? onDelete || onUpdate
              ? 'sm:grid-cols-[200px_120px_1fr_auto]'
              : 'sm:grid-cols-[200px_120px_1fr]'
            : 'sm:grid-cols-[170px_1fr]'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">
            {formatLogDateTime(log.at, detailed)}
          </span>
          {isAdjustment ? <span className="pill">Adjustment</span> : null}
        </div>
        {detailed ? (
          <span className="text-sm font-medium text-fg tabular-nums">
            {formattedValue}
          </span>
        ) : null}
        <span className="text-sm text-fg">
          {!detailed && typeof log.value === 'number'
            ? `${formattedValue}${formattedDelta ? ` · ${formattedDelta}` : ''}${log.note ? ` · ${log.note}` : ''}`
            : `${formattedDelta ? `${formattedDelta}${log.note ? ` · ${log.note}` : ''}` : log.note ?? ''}`}
        </span>
        {detailed && (onUpdate || onDelete) ? (
          <div className="flex items-start gap-1 sm:justify-self-end">
            {onUpdate ? (
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 text-xs"
                onClick={() => {
                  setEditDateTime(toLocalDateTimeInputValue(log.at));
                  setEditNote(log.note ?? '');
                  setIsEditing(!isEditing);
                }}
              >
                {isEditing ? 'Close' : 'Edit'}
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 text-xs text-danger"
                onClick={async () => {
                  if (!window.confirm('Delete this log entry?')) return;
                  await onDelete(log.id);
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {detailed && onUpdate && isEditing ? (
        <div className="mt-2 grid gap-2 rounded-md border border-border bg-surface px-2.5 py-2">
          <div className="space-y-1">
            <label htmlFor={`edit-log-date-time-${log.id}`} className="label">
              Date &amp; time
            </label>
            <input
              id={`edit-log-date-time-${log.id}`}
              type="datetime-local"
              className="input"
              value={editDateTime}
              onChange={(event) => setEditDateTime(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`edit-log-note-${log.id}`} className="label">
              Note
            </label>
            <textarea
              id={`edit-log-note-${log.id}`}
              className="input min-h-[80px] resize-y py-2"
              value={editNote}
              onChange={(event) => setEditNote(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditDateTime(toLocalDateTimeInputValue(log.at));
                setEditNote(log.note ?? '');
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const nextAt = new Date(editDateTime);
                if (Number.isNaN(nextAt.getTime())) return;
                await onUpdate(log.id, {
                  at: nextAt.toISOString(),
                  note: editNote,
                });
                setIsEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCell({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </p>
    </div>
  );
}

function relativeDate(iso: string): string {
  const diffDays = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.round(diffDays / 7)}w ago`;
}

function TrendChart({
  goal,
  height = 280,
  showPaceLine = true,
}: {
  goal: TrendGoal;
  height?: number;
  showPaceLine?: boolean;
}) {
  const [width, setWidth] = useState(640);
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.max(320, entries[0]?.contentRect.width ?? 640));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const innerW = Math.max(40, width - padL - padR);
  const innerH = height - padT - padB;

  const sorted = [...goal.logs].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const t0 = parseDateOnly(goal.startDate).getTime();
  const t1 = parseDateOnly(goal.targetDate).getTime();
  const values = [goal.startValue, goal.targetValue, ...sorted.map((item) => item.value ?? goal.startValue)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const yMin = min - pad;
  const yMax = max + pad;
  const xOf = (t: number) => padL + ((t - t0) / ((t1 - t0) || 1)) * innerW;
  const yOf = (v: number) => padT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * innerH;
  const points = sorted.map((entry) => ({
    x: xOf(new Date(entry.at).getTime()),
    y: yOf(entry.value ?? goal.startValue),
    note: entry.note,
  }));
  const linePath = points
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : '';
  const now = Date.now();
  const nowX = now >= t0 && now <= t1 ? xOf(now) : null;
  const yTicks = Array.from({ length: 5 }, (_, idx) => yMin + (idx / 4) * (yMax - yMin));
  const xTicks = [t0, (t0 + t1) / 2, t1];

  return (
    <div ref={setNode}>
      <svg width={width} height={height} className="block max-w-full overflow-visible">
        <defs>
          <linearGradient id={`trend-area-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.20" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, idx) => (
          <g key={`y-${idx}`}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="rgb(var(--border))"
              strokeDasharray="2 4"
            />
            <text x={padL - 8} y={yOf(tick) + 3} textAnchor="end" className="fill-muted text-[11px]">
              {tick.toFixed(tick >= 100 ? 0 : 1)}
            </text>
          </g>
        ))}
        {xTicks.map((tick, idx) => (
          <text
            key={`x-${idx}`}
            x={xOf(tick)}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted text-[11px]"
          >
            {dateOnlyShortFormatter.format(new Date(tick))}
          </text>
        ))}
        {showPaceLine ? (
          <line
            x1={xOf(t0)}
            y1={yOf(goal.startValue)}
            x2={xOf(t1)}
            y2={yOf(goal.targetValue)}
            stroke="rgb(var(--muted))"
            strokeWidth={1.4}
            strokeDasharray="5 5"
            opacity={0.7}
          />
        ) : null}
        {nowX != null ? (
          <line
            x1={nowX}
            y1={padT}
            x2={nowX}
            y2={padT + innerH}
            stroke="rgb(var(--accent))"
            strokeDasharray="2 3"
            opacity={0.5}
          />
        ) : null}
        {points.length > 1 ? (
          <path d={areaPath} fill={`url(#trend-area-${goal.id})`} />
        ) : null}
        {points.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {points.map((point, idx) => (
          <g key={`${goal.id}-point-${idx}`}>
            <circle cx={point.x} cy={point.y} r="4" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />
            {point.note ? <circle cx={point.x + 5.5} cy={point.y - 5.5} r="2.2" fill="rgb(var(--fg))" /> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Donut({
  percent,
  label,
  sublabel,
}: {
  percent: number;
  label: string;
  sublabel?: string;
}) {
  const size = 180;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-surface2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          className="fill-none stroke-accent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[28px] font-semibold tracking-tight tabular-nums text-fg">{label}</div>
        {sublabel ? <div className="mt-0.5 text-[11px] text-muted">{sublabel}</div> : null}
      </div>
    </div>
  );
}

function MiniBars({ values, width, height }: { values: number[]; width: number; height: number }) {
  const max = Math.max(...values, 1);
  const barW = width / values.length - 2;
  return (
    <svg width={width} height={height}>
      {values.map((value, idx) => {
        const h = Math.max(2, (value / max) * height);
        return (
          <rect
            key={`bar-${idx}`}
            x={idx * (barW + 2)}
            y={height - h}
            width={barW}
            height={h}
            rx={1.5}
            className={value > 0 ? 'fill-accent' : 'fill-surface2'}
          />
        );
      })}
    </svg>
  );
}
