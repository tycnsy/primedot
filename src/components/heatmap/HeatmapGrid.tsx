import { addDays, format, getDay } from 'date-fns';
import { useMemo, useState, type MouseEvent } from 'react';
import {
  DEFAULT_COLOR_OPTIONS,
  buildHeatmapGrid,
  buildHeatmapRange,
  getViewRange,
  rollingWindowSize,
  viewRangeLabel,
  weekdayLabel,
  type HeatmapColorMode,
  type HeatmapColorOptions,
  type HeatmapDayCell,
  type HeatmapView,
} from '../../lib/heatmap';
import { formatHMS } from '../../lib/time';
import type { RealtimeLog } from '../../lib/types';

const LEVEL_CLASSES: Record<HeatmapDayCell['level'], string> = {
  0: 'bg-surface-2 border-border/40',
  1: 'bg-success/20 border-success/30',
  2: 'bg-success/40 border-success/40',
  3: 'bg-success/60 border-success/50',
  4: 'bg-success/80 border-success/60',
};

const PRE_START_CLASSES = 'bg-fg/15 border-fg/20';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((i) => weekdayLabel(i));

interface HeatmapGridProps {
  logs: RealtimeLog[];
  weeks?: number;
  compact?: boolean;
  view?: HeatmapView;
  colorMode?: HeatmapColorMode;
  /** Daily target in seconds, used when colorMode is 'goal'. */
  goalSecondsPerDay?: number;
  selectedDateKey?: string | null;
  onSelectDay?: (cell: HeatmapDayCell) => void;
  yearlyStartDate?: Date | null;
  rollingOffsetDays?: number;
  onShiftDays?: (delta: number) => void;
}

interface CellLayoutProps {
  logs: RealtimeLog[];
  view: HeatmapView;
  color: HeatmapColorOptions;
  selectedDateKey?: string | null;
  onSelectDay?: (cell: HeatmapDayCell) => void;
  rollingOffsetDays?: number;
  onShiftDays?: (delta: number) => void;
}

interface HoverTooltipState {
  cell: HeatmapDayCell;
  rect: DOMRect;
}

function goalPercent(seconds: number, goalSeconds: number): number {
  if (goalSeconds <= 0) return 0;
  return Math.round((seconds / goalSeconds) * 100);
}

function showGoalPercent(color: HeatmapColorOptions): boolean {
  return color.mode === 'goal' && color.goalSecondsPerDay > 0;
}

function GoalPercentLabel({
  cell,
  color,
  className = '',
}: {
  cell: HeatmapDayCell;
  color: HeatmapColorOptions;
  className?: string;
}) {
  if (!showGoalPercent(color)) return null;
  const pct = goalPercent(cell.totalSeconds, color.goalSecondsPerDay);
  return (
    <span className={`tabular-nums font-semibold leading-none text-fg/85 ${className}`}>
      {pct}%
    </span>
  );
}

function dayTooltip(cell: HeatmapDayCell, color: HeatmapColorOptions): string {
  const label = format(cell.date, 'EEE, MMM d, yyyy');
  if (cell.preStart) {
    return `${label}: before tracking start`;
  }
  const total = formatHMS(Math.round(cell.totalSeconds));
  if (color.mode === 'goal') {
    if (color.goalSecondsPerDay <= 0) {
      return `${label}: ${total} realtime — no goal set`;
    }
    const pct = goalPercent(cell.totalSeconds, color.goalSecondsPerDay);
    const goal = formatHMS(Math.round(color.goalSecondsPerDay));
    return `${label}: ${total} of ${goal} goal (${pct}%)`;
  }
  return `${label}: ${total} realtime`;
}

function interactionClasses(
  cell: HeatmapDayCell,
  selectedDateKey: string | null | undefined,
  onSelectDay: ((cell: HeatmapDayCell) => void) | undefined,
): string {
  if (cell.preStart) return '';
  const selected = selectedDateKey != null && cell.dateKey === selectedDateKey;
  return [
    onSelectDay ? 'cursor-pointer hover:ring-1 hover:ring-fg/40' : '',
    selected ? 'ring-2 ring-fg' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Legend({ color }: { color: HeatmapColorOptions }) {
  const isGoal = color.mode === 'goal';
  return (
    <div className="flex items-center gap-1 text-xs">
      <span>{isGoal ? '0%' : 'Less'}</span>
      {([0, 1, 2, 3, 4] as const).map((level) => (
        <div key={level} className={`h-3 w-3 rounded-sm border ${LEVEL_CLASSES[level]}`} />
      ))}
      <span>{isGoal ? '100%+' : 'More'}</span>
    </div>
  );
}

function SummaryHeader({
  totalSeconds,
  view,
  color,
  range,
}: {
  totalSeconds: number;
  view: HeatmapView;
  color: HeatmapColorOptions;
  range?: { start: Date; end: Date };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span>
        <span className="font-medium text-fg">{formatHMS(Math.round(totalSeconds))}</span>{' '}
        realtime {viewRangeLabel(view, range)}
        {color.mode === 'goal' && color.goalSecondsPerDay > 0 ? (
          <>
            {' · '}
            goal {formatHMS(Math.round(color.goalSecondsPerDay))}/day
          </>
        ) : null}
      </span>
      <Legend color={color} />
    </div>
  );
}

function CellHoverTooltip({
  tooltip,
  color,
}: {
  tooltip: HoverTooltipState;
  color: HeatmapColorOptions;
}) {
  const { cell, rect } = tooltip;
  const left = rect.left + rect.width / 2;
  const top = rect.top - 8;

  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-md"
      style={{ left, top }}
      role="tooltip"
    >
      <div className="font-medium">{format(cell.date, 'EEE, MMM d, yyyy')}</div>
      {cell.preStart ? (
        <div className="text-muted">Before tracking start</div>
      ) : (
        <div className="text-muted">{dayTooltip(cell, color).split(': ').slice(1).join(': ')}</div>
      )}
    </div>
  );
}

/** Full year, GitHub-style: week columns × Sun–Sat rows (the "Yearly" view). */
function YearGrid({
  logs,
  weeks,
  compact,
  color,
  selectedDateKey,
  onSelectDay,
  yearlyStartDate,
}: {
  logs: RealtimeLog[];
  weeks: number;
  compact?: boolean;
  color: HeatmapColorOptions;
  selectedDateKey?: string | null;
  onSelectDay?: (cell: HeatmapDayCell) => void;
  yearlyStartDate?: Date | null;
}) {
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);

  const grid = useMemo(
    () => buildHeatmapGrid(logs, weeks, new Date(), color, yearlyStartDate ?? null),
    [logs, weeks, color, yearlyStartDate],
  );

  const monthLabels = useMemo(() => {
    let previousMonth = -1;
    return grid.weeks.map((week) => {
      const sunday = addDays(week.weekStart, -getDay(week.weekStart));
      const month = sunday.getMonth();
      if (month !== previousMonth) {
        previousMonth = month;
        return format(sunday, 'MMM');
      }
      return '';
    });
  }, [grid.weeks]);

  const isGoal = showGoalPercent(color);
  const cellSize = isGoal
    ? compact
      ? 'h-4 w-4'
      : 'h-5 w-5'
    : compact
      ? 'h-3 w-3'
      : 'h-3.5 w-3.5';
  const colWidth = isGoal ? (compact ? 'w-4' : 'w-5') : compact ? 'w-3' : 'w-3.5';
  const gutterWidth = 'w-9';

  const handleCellMouseEnter = (
    cell: HeatmapDayCell,
    e: MouseEvent<HTMLElement>,
  ) => {
    setHoverTooltip({ cell, rect: e.currentTarget.getBoundingClientRect() });
  };

  const renderCell = (cell: HeatmapDayCell) => {
    const className = `flex items-center justify-center rounded-sm border ${cell.preStart ? PRE_START_CLASSES : LEVEL_CLASSES[cell.level]} ${cellSize} transition-colors ${interactionClasses(cell, selectedDateKey, onSelectDay)}`;

    if (cell.preStart) {
      return (
        <div
          key={cell.dateKey}
          className={className}
          onMouseEnter={(e) => handleCellMouseEnter(cell, e)}
          onMouseLeave={() => setHoverTooltip(null)}
          aria-label={dayTooltip(cell, color)}
        />
      );
    }

    return (
      <button
        type="button"
        key={cell.dateKey}
        onClick={onSelectDay ? () => onSelectDay(cell) : undefined}
        className={className}
        onMouseEnter={(e) => handleCellMouseEnter(cell, e)}
        onMouseLeave={() => setHoverTooltip(null)}
        aria-label={dayTooltip(cell, color)}
      >
        <GoalPercentLabel
          cell={cell}
          color={color}
          className={isGoal ? (compact ? 'text-[7px]' : 'text-[8px]') : ''}
        />
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <SummaryHeader totalSeconds={grid.totalSeconds} view="yearly" color={color} />

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1">
            <div className={`${gutterWidth} shrink-0`} />
            {monthLabels.map((label, index) => (
              <div
                key={grid.weeks[index].weekStart.toISOString()}
                className={`${colWidth} shrink-0 whitespace-nowrap text-[10px] leading-none text-muted`}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex gap-1">
            <div className={`${gutterWidth} shrink-0 flex flex-col gap-1 text-[10px] text-muted`}>
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <div key={row} className={`flex ${cellSize} items-center leading-none`}>
                  {row % 2 === 1 ? weekdayLabel(row) : ''}
                </div>
              ))}
            </div>

            {grid.weeks.map((week) => (
              <div key={week.weekStart.toISOString()} className="flex flex-col gap-1">
                {week.days.map((cell, rowIndex) =>
                  cell ? (
                    renderCell(cell)
                  ) : (
                    <div
                      key={`empty-${week.weekStart.toISOString()}-${rowIndex}`}
                      className={cellSize}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hoverTooltip ? <CellHoverTooltip tooltip={hoverTooltip} color={color} /> : null}
    </div>
  );
}

/** One calendar month laid out Sun–Sat with larger squares (the "Monthly" view). */
function MonthCalendar({ logs, view, color, selectedDateKey, onSelectDay }: CellLayoutProps) {
  const range = useMemo(() => {
    const { start, end } = getViewRange(view);
    return buildHeatmapRange(logs, start, end, color);
  }, [logs, view, color]);

  const leadingBlanks = range.cells.length > 0 ? getDay(range.cells[0].date) : 0;

  return (
    <div className="space-y-3">
      <SummaryHeader totalSeconds={range.totalSeconds} view={view} color={color} />

      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-fg">
          {range.cells.length > 0 ? format(range.cells[0].date, 'MMMM yyyy') : ''}
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted">
          {WEEKDAYS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
          {range.cells.map((cell) => {
            const isGoal = showGoalPercent(color);
            return (
              <button
                type="button"
                key={cell.dateKey}
                onClick={onSelectDay ? () => onSelectDay(cell) : undefined}
                title={dayTooltip(cell, color)}
                aria-label={dayTooltip(cell, color)}
                className={`flex aspect-square flex-col justify-between rounded-md border p-1.5 text-left transition-colors ${LEVEL_CLASSES[cell.level]} ${interactionClasses(cell, selectedDateKey, onSelectDay)}`}
              >
                <span className="text-xs font-medium text-fg/80">
                  {format(cell.date, 'd')}
                </span>
                {isGoal ? (
                  <GoalPercentLabel cell={cell} color={color} className="text-sm" />
                ) : cell.totalSeconds > 0 ? (
                  <span className="text-[10px] leading-none text-fg/70 tabular-nums">
                    {formatHMS(Math.round(cell.totalSeconds))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RollingNavButtons({
  view,
  onShiftDays,
}: {
  view: HeatmapView;
  onShiftDays: (delta: number) => void;
}) {
  const windowSize = rollingWindowSize(view);
  if (windowSize == null) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onShiftDays(-windowSize)}
          aria-label={`Jump back ${windowSize} days`}
          title={`Jump back ${windowSize} days`}
        >
          «
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onShiftDays(-1)}
          aria-label="Go back one day"
          title="Back one day"
        >
          ‹
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onShiftDays(1)}
          aria-label="Go forward one day"
          title="Forward one day"
        >
          ›
        </button>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onShiftDays(windowSize)}
          aria-label={`Jump forward ${windowSize} days`}
          title={`Jump forward ${windowSize} days`}
        >
          »
        </button>
      </div>
    </div>
  );
}

/** A short row of large labeled day cards (the "Weekly" and rolling views). */
function DayCards({
  logs,
  view,
  color,
  selectedDateKey,
  onSelectDay,
  rollingOffsetDays = 0,
  onShiftDays,
}: CellLayoutProps) {
  const viewRange = useMemo(
    () => getViewRange(view, new Date(), rollingOffsetDays),
    [view, rollingOffsetDays],
  );

  const range = useMemo(
    () => buildHeatmapRange(logs, viewRange.start, viewRange.end, color),
    [logs, viewRange, color],
  );

  const count = range.cells.length;
  const isRolling = view === 'rolling3' || view === 'rolling5';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SummaryHeader
          totalSeconds={range.totalSeconds}
          view={view}
          color={color}
          range={isRolling && rollingOffsetDays !== 0 ? viewRange : undefined}
        />
        {isRolling && onShiftDays ? (
          <RollingNavButtons view={view} onShiftDays={onShiftDays} />
        ) : null}
      </div>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          maxWidth: `${count * 7}rem`,
        }}
      >
        {range.cells.map((cell) => {
          const total = formatHMS(Math.round(cell.totalSeconds));
          const isGoal = showGoalPercent(color);
          return (
            <div key={cell.dateKey} className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-medium text-muted">
                {format(cell.date, 'EEE')}
              </span>
              <button
                type="button"
                onClick={onSelectDay ? () => onSelectDay(cell) : undefined}
                title={dayTooltip(cell, color)}
                aria-label={dayTooltip(cell, color)}
                className={`flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border transition-colors ${LEVEL_CLASSES[cell.level]} ${interactionClasses(cell, selectedDateKey, onSelectDay)}`}
              >
                <span className="text-lg font-semibold text-fg/80">
                  {format(cell.date, 'd')}
                </span>
                {isGoal ? <GoalPercentLabel cell={cell} color={color} className="text-base" /> : null}
              </button>
              <span className="text-[11px] text-muted tabular-nums">
                {cell.totalSeconds > 0 ? total : '—'}
              </span>
              <span className="text-[10px] text-muted">{format(cell.date, 'MMM')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HeatmapGrid({
  logs,
  weeks = 52,
  compact,
  view = 'yearly',
  colorMode = 'relative',
  goalSecondsPerDay = 0,
  selectedDateKey,
  onSelectDay,
  yearlyStartDate,
  rollingOffsetDays = 0,
  onShiftDays,
}: HeatmapGridProps) {
  const color = useMemo<HeatmapColorOptions>(
    () =>
      colorMode === 'goal'
        ? { mode: 'goal', goalSecondsPerDay }
        : DEFAULT_COLOR_OPTIONS,
    [colorMode, goalSecondsPerDay],
  );

  if (view === 'monthly') {
    return (
      <MonthCalendar
        logs={logs}
        view={view}
        color={color}
        selectedDateKey={selectedDateKey}
        onSelectDay={onSelectDay}
      />
    );
  }
  if (view === 'weekly' || view === 'rolling3' || view === 'rolling5') {
    return (
      <DayCards
        logs={logs}
        view={view}
        color={color}
        selectedDateKey={selectedDateKey}
        onSelectDay={onSelectDay}
        rollingOffsetDays={rollingOffsetDays}
        onShiftDays={onShiftDays}
      />
    );
  }
  return (
    <YearGrid
      logs={logs}
      weeks={weeks}
      compact={compact}
      color={color}
      selectedDateKey={selectedDateKey}
      onSelectDay={onSelectDay}
      yearlyStartDate={yearlyStartDate}
    />
  );
}
