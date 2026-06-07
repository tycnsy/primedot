import { format } from 'date-fns';
import {
  currentPace,
  currentPaceEnd,
  estimatedCompletion,
  paceMargin,
  remainingProgress,
  totalTaskLength,
  projectProgress,
} from '../lib/calc';
import { formatHMS } from '../lib/time';
import type { PaceSettings, Project, Task } from '../lib/types';
import { useTicker } from '../hooks/useTicker';

interface Props {
  project: Project;
  tasks: Task[];
  pace: PaceSettings | null;
  /** Render only the pace numbers needed on the timer page. */
  compact?: boolean;
  /** Non-compact sections for project pace tab layout. */
  section?: 'all' | 'headline' | 'details';
}

function fmtDate(d: Date) {
  return format(d, 'EEE MMM d, h:mm a');
}

type PaceState = 'behind' | 'tight' | 'ahead';

function paceState(seconds: number): PaceState {
  if (seconds < 0) return 'behind';
  if (seconds < 3600) return 'tight';
  return 'ahead';
}

const paceTextColor: Record<PaceState, string> = {
  behind: 'text-danger',
  tight: 'text-warn',
  ahead: 'text-success',
};

const paceGlowVar: Record<PaceState, string> = {
  behind: '--danger',
  tight: '--warn',
  ahead: '--success',
};

export default function PaceDisplay({
  project,
  tasks,
  pace,
  compact,
  section = 'all',
}: Props) {
  const now = useTicker(1000);

  const totalLen = totalTaskLength(tasks, project);
  const progress = projectProgress(tasks, project);
  const remaining = remainingProgress(tasks, project);

  const completion = estimatedCompletion(tasks, project, now);

  if (!pace && section === 'headline') {
    return (
      <div className="card">
        <div className="text-xs text-muted">No pace set yet.</div>
      </div>
    );
  }

  if (!pace && section === 'details') {
    return (
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-fg">Other pace properties</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            label="Estimated completion"
            value={fmtDate(completion)}
            mono
          />
          <Stat
            label="Remaining"
            value={formatHMS(remaining)}
            subtext={`of ${formatHMS(totalLen)} (done ${formatHMS(progress)})`}
            mono
          />
        </div>
      </div>
    );
  }

  if (!pace) {
    return (
      <div className="card space-y-2">
        <div className="text-xs text-muted">
          No pace set yet. Estimated completion is shown based on remaining task
          length.
        </div>
        <Stat
          label="Estimated completion"
          value={fmtDate(completion)}
          mono
        />
        <Stat
          label="Remaining"
          value={formatHMS(remaining)}
          subtext={`of ${formatHMS(totalLen)} (done ${formatHMS(progress)})`}
          mono
        />
      </div>
    );
  }

  const pace_secs = currentPace(tasks, project, pace, now);
  const margin = paceMargin(pace);
  const paceEnd = currentPaceEnd(tasks, project, pace);
  const target = new Date(pace.target_deadline);
  const trueDl = new Date(pace.true_deadline);
  const due = project.due_date ? new Date(project.due_date) : null;
  const trueVsDueSeconds =
    due && !Number.isNaN(due.getTime())
      ? Math.round((trueDl.getTime() - due.getTime()) / 1000)
      : null;

  const state = paceState(pace_secs);
  const paceColor = paceTextColor[state];
  const glowVar = paceGlowVar[state];

  if (compact) {
    return (
      <div className="card grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 sm:divide-x sm:divide-border [&>*:not(:first-child)]:sm:pl-6">
        <Stat
          label="Current pace"
          value={formatHMS(pace_secs)}
          mono
          valueClassName={paceColor}
        />
        <Stat label="Est. completion" value={fmtDate(completion)} />
        <Stat label="Pace end" value={fmtDate(paceEnd)} />
        <Stat
          label="Remaining"
          value={formatHMS(remaining)}
          subtext={`of ${formatHMS(totalLen)}`}
          mono
        />
      </div>
    );
  }

  const headlineSection = (
    <div
      className="card"
      style={{ backgroundColor: `rgb(var(${glowVar}) / 0.12)` }}
    >
      <div className="flex flex-col items-center text-center">
        <div className="label">Current pace</div>
        <div
          className={`mt-2 font-sans text-5xl font-semibold leading-tight tabular-nums ${paceColor}`}
          style={{
            textShadow: `0 0 32px rgb(var(${glowVar}) / 0.30)`,
          }}
        >
          {formatHMS(pace_secs)}
        </div>
        <div className="mt-1 text-xs text-subtle">
          {state === 'behind'
            ? 'behind schedule'
            : state === 'tight'
              ? 'tight — under 1h ahead'
              : 'ahead of schedule'}
        </div>

        <div className="mt-5 w-full max-w-sm divider opacity-70" />

        <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-4 text-center">
          <div>
            <div className="label">Current pace end</div>
            <div className="mt-1 text-sm text-fg">{fmtDate(paceEnd)}</div>
          </div>
          <div>
            <div className="label">Pace margin</div>
            <div
              className={`mt-1 text-sm font-sans tabular-nums ${
                margin < 0 ? 'text-danger' : 'text-fg'
              }`}
            >
              {formatHMS(margin)}
            </div>
            <div className="text-[11px] text-subtle">
              {margin < 0 ? 'overcommitted' : 'buffer beyond true deadline'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const detailsSection = (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-fg">Other pace properties</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Estimated completion" value={fmtDate(completion)} />
        <Stat label="Target deadline" value={fmtDate(target)} />
        <Stat label="True deadline" value={fmtDate(trueDl)} />
        <Stat
          label="True vs due"
          value={trueVsDueSeconds == null ? '—' : formatHMS(trueVsDueSeconds)}
          subtext={
            trueVsDueSeconds == null
              ? 'Set a project due date to compare.'
              : trueVsDueSeconds < 0
                ? 'true deadline is before due date'
                : trueVsDueSeconds > 0
                  ? 'true deadline is after due date'
                  : 'true deadline matches due date'
          }
          mono
        />
        <Stat
          label="Remaining"
          value={formatHMS(remaining)}
          subtext={`of ${formatHMS(totalLen)} (done ${formatHMS(progress)})`}
          mono
        />
      </div>
    </div>
  );

  if (section === 'headline') return headlineSection;
  if (section === 'details') return detailsSection;

  return (
    <div className="space-y-6">
      {headlineSection}
      {detailsSection}
    </div>
  );
}

function Stat({
  label,
  value,
  subtext,
  mono,
  valueClassName,
}: {
  label: string;
  value: string;
  subtext?: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={`mt-0.5 text-base text-fg ${
          mono ? 'font-sans tabular-nums' : ''
        } ${valueClassName ?? ''}`}
      >
        {value}
      </div>
      {subtext ? <div className="text-xs text-subtle">{subtext}</div> : null}
    </div>
  );
}
