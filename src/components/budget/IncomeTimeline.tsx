import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDisplayDate, formatMoney, isoDate } from '../../features/budget';
import type { ProjectionPoint } from '../../features/budget';

interface IncomeTimelineProps {
  points: ProjectionPoint[];
  currency: string;
  today?: string;
  ariaLabel?: string;
  emptyLabel?: string;
}

const DEFAULT_WIDTH = 640;
const HEIGHT = 160;
const PAD = 8;

type Coord = {
  x: number;
  y: number;
  point: ProjectionPoint;
  id: string;
};

function dayNumber(isoDay: string): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1);
}

function xForDay(
  isoDay: string,
  firstDay: number,
  daySpan: number,
  chartWidth: number,
  intraDayOffset = 0,
): number {
  const dayOffset = (dayNumber(isoDay) - firstDay) / 86400000;
  return PAD + ((dayOffset + intraDayOffset) / daySpan) * (chartWidth - PAD * 2);
}

/** Cumulative step chart: hold flat until the next date, then step vertically. */
function toStepPath(segment: Coord[]): string {
  if (segment.length === 0) return '';
  let path = `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`;
  for (let i = 1; i < segment.length; i++) {
    path += ` L ${segment[i].x.toFixed(1)} ${segment[i - 1].y.toFixed(1)}`;
    path += ` L ${segment[i].x.toFixed(1)} ${segment[i].y.toFixed(1)}`;
  }
  return path;
}

function splitByToday(coords: Coord[], todayIso: string) {
  const past = coords.filter((coord) => coord.point.date <= todayIso);
  const future = coords.filter((coord) => coord.point.date > todayIso);
  const lastPast = past[past.length - 1];
  const dashed = lastPast ? [lastPast, ...future] : future;
  return { solid: past, dashed };
}

export default function IncomeTimeline({
  points,
  currency,
  today,
  ariaLabel = 'Projected income timeline',
  emptyLabel = 'No projection available.',
}: IncomeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_WIDTH);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const todayIso = today ?? isoDate(new Date());

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setChartWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.totalIncome);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = max - min || 1;

    const firstDay = Math.min(...points.map((point) => dayNumber(point.date)));
    const lastDay = Math.max(...points.map((point) => dayNumber(point.date)));
    const daySpan = Math.max(1, (lastDay - firstDay) / 86400000);

    const dayCounts = new Map<string, number>();
    for (const point of points) {
      dayCounts.set(point.date, (dayCounts.get(point.date) ?? 0) + 1);
    }
    const dayOffsets = new Map<string, number>();

    const coords: Coord[] = points.map((point, index) => ({
      x: (() => {
        const seenForDay = dayOffsets.get(point.date) ?? 0;
        const countForDay = dayCounts.get(point.date) ?? 1;
        dayOffsets.set(point.date, seenForDay + 1);
        const intraDayOffset = countForDay > 1 ? (seenForDay / countForDay) * 0.7 : 0;
        return xForDay(point.date, firstDay, daySpan, chartWidth, intraDayOffset);
      })(),
      y: PAD + (HEIGHT - PAD * 2) * (1 - (point.totalIncome - min) / span),
      point,
      id: point.entryId ? `${point.entryId}-${point.kind ?? 'point'}-${index}` : `${point.date}-${index}`,
    }));

    const { solid, dashed } = splitByToday(coords, todayIso);

    const rangeStart = points[0].date;
    const rangeEnd = points[points.length - 1].date;
    const futureBandX =
      todayIso >= rangeStart && todayIso <= rangeEnd
        ? xForDay(todayIso, firstDay, daySpan, chartWidth)
        : null;

    return {
      solidPath: toStepPath(solid),
      dashedPath: toStepPath(dashed),
      markerDots: coords.filter(
        (coord) =>
          coord.point.incomeAdded > 0 ||
          coord.point.kind === 'adjustment' ||
          coord.point.kind === 'projection',
      ),
      futureBandX,
      min,
      max,
    };
  }, [points, todayIso, chartWidth]);

  if (!geometry) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  const hoveredPoint = geometry.markerDots.find((dot) => dot.id === hoveredId)?.point;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-40 w-full">
      <svg
        viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {geometry.futureBandX !== null ? (
          <rect
            x={geometry.futureBandX}
            y={PAD}
            width={chartWidth - PAD - geometry.futureBandX}
            height={HEIGHT - PAD * 2}
            fill="rgb(var(--border))"
            opacity="0.18"
          />
        ) : null}
        {geometry.solidPath ? (
          <path
            d={geometry.solidPath}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {geometry.dashedPath ? (
          <path
            d={geometry.dashedPath}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="2"
            strokeOpacity="0.55"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {geometry.markerDots.map((dot) => {
          const isAdjustment = dot.point.kind === 'adjustment';
          const isProjection = dot.point.kind === 'projection';
          return (
            <g key={dot.id}>
              {isAdjustment ? (
                <rect
                  x={dot.x - 3.5}
                  y={dot.y - 3.5}
                  width={7}
                  height={7}
                  transform={`rotate(45 ${dot.x} ${dot.y})`}
                  fill="rgb(var(--surface))"
                  stroke="rgb(var(--accent))"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredId(dot.id)}
                  onMouseLeave={() => setHoveredId((current) => (current === dot.id ? null : current))}
                  onFocus={() => setHoveredId(dot.id)}
                  onBlur={() => setHoveredId((current) => (current === dot.id ? null : current))}
                />
              ) : (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={isProjection ? 4 : 3.5}
                  fill={dot.point.confirmed ? 'rgb(var(--success))' : 'rgb(var(--surface))'}
                  stroke={dot.point.confirmed ? 'rgb(var(--success))' : 'rgb(var(--accent))'}
                  strokeWidth="1.5"
                  strokeDasharray={isProjection ? '2 2' : undefined}
                  className="cursor-pointer"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredId(dot.id)}
                  onMouseLeave={() => setHoveredId((current) => (current === dot.id ? null : current))}
                  onFocus={() => setHoveredId(dot.id)}
                  onBlur={() => setHoveredId((current) => (current === dot.id ? null : current))}
                />
              )}
              <title>
                {(dot.point.sourceName ?? 'Income') +
                  ` on ${formatDisplayDate(dot.point.date)}: ${formatMoney(dot.point.incomeAdded, currency)} (total ${formatMoney(dot.point.totalIncome, currency)})`}
              </title>
            </g>
          );
        })}
      </svg>
      </div>
      <div className="rounded-md border border-border/70 bg-surface2/40 px-3 py-2 text-xs text-muted">
        {hoveredPoint ? (
          <p>
            {hoveredPoint.sourceName ?? 'Income'} on {formatDisplayDate(hoveredPoint.date)}: +{' '}
            <span className="font-semibold text-fg">
              {formatMoney(hoveredPoint.incomeAdded, currency)}
            </span>{' '}
            (monthly total{' '}
            <span className="font-semibold text-fg">
              {formatMoney(hoveredPoint.totalIncome, currency)}
            </span>
            )
          </p>
        ) : (
          <p>Hover an income point to see source, amount, and running monthly total.</p>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>Low {formatMoney(geometry.min, currency)}</span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success" /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-accent" /> Expected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-4 rounded-sm bg-border/30 ring-1 ring-border/50" /> Future
          </span>
        </span>
        <span>High {formatMoney(geometry.max, currency)}</span>
      </div>
    </div>
  );
}
