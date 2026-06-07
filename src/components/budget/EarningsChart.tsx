import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  formatDisplayDate,
  formatEarnedMonth,
  formatMoney,
  goalPaceAtDate,
  isoDate,
  type EarningsChartData,
  type EarningsChartPoint,
} from '../../features/budget';

interface EarningsChartProps {
  data: EarningsChartData;
  currency: string;
  /** When set, show a marker on the goal pace line at this date (e.g. today). */
  paceMarkerDate?: string | null;
  onDeleteSnapshot?: (id: string) => void;
  ariaLabel?: string;
}

const DEFAULT_WIDTH = 640;
const HEIGHT = 200;
const PAD_X = 0;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;

type PointCoord = {
  x: number;
  y: number;
  point: EarningsChartPoint;
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
): number {
  const dayOffset = (dayNumber(isoDay) - firstDay) / 86400000;
  return PAD_X + (dayOffset / daySpan) * (chartWidth - PAD_X * 2);
}

function toLinePath(segment: PointCoord[]): string {
  if (segment.length === 0) return '';
  return segment
    .map((coord, idx) => `${idx === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(' ');
}

function isoDayFromOffset(monthStart: string, dayOffset: number): string {
  const d = new Date(`${monthStart}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  return isoDate(d);
}

function dayOffsetFromX(x: number, daySpan: number, chartWidth: number): number {
  const plotWidth = chartWidth - PAD_X * 2;
  if (plotWidth <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (x - PAD_X) / plotWidth));
  return Math.round(ratio * daySpan);
}

function clientXToSvgX(svg: SVGSVGElement, clientX: number): number {
  const rect = svg.getBoundingClientRect();
  const { width } = svg.viewBox.baseVal;
  return ((clientX - rect.left) / rect.width) * width;
}

export default function EarningsChart({
  data,
  currency,
  paceMarkerDate,
  onDeleteSnapshot,
  ariaLabel = 'Monthly earnings chart',
}: EarningsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(DEFAULT_WIDTH);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredPaceDay, setHoveredPaceDay] = useState<string | null>(null);

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
    const { monthStart, monthEnd, points, goalAmount } = data;
    const firstDay = dayNumber(monthStart);
    const lastDay = dayNumber(monthEnd);
    const daySpan = Math.max(1, (lastDay - firstDay) / 86400000);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const paceAtMarker =
      paceMarkerDate && goalAmount != null
        ? goalPaceAtDate(data.month, goalAmount, paceMarkerDate)
        : null;

    const allAmounts = [
      ...points.map((p) => p.totalAmount),
      0,
      ...(goalAmount != null ? [goalAmount] : []),
      ...(paceAtMarker != null ? [paceAtMarker] : []),
    ];
    const min = Math.min(...allAmounts, 0);
    const max = Math.max(...allAmounts, 1);
    const span = max - min || 1;

    const yForAmount = (amount: number) => PAD_TOP + innerH * (1 - (amount - min) / span);

    const linePoints: EarningsChartPoint[] =
      points.length > 0
        ? [{ id: 'anchor', date: monthStart, totalAmount: 0, recordedAt: monthStart }, ...points]
        : [];

    const coords: PointCoord[] = linePoints.map((point) => ({
      x: xForDay(point.date, firstDay, daySpan, chartWidth),
      y: yForAmount(point.totalAmount),
      point,
    }));

    const markerCoords = coords.filter((coord) => coord.point.id !== 'anchor');
    const linePath = toLinePath(coords);

    const goalPaceLine =
      goalAmount != null
        ? {
            x1: xForDay(monthStart, firstDay, daySpan, chartWidth),
            y1: yForAmount(0),
            x2: xForDay(monthEnd, firstDay, daySpan, chartWidth),
            y2: yForAmount(goalAmount),
          }
        : null;

    const paceMarker =
      paceMarkerDate && paceAtMarker != null && goalAmount != null
        ? {
            x: xForDay(paceMarkerDate, firstDay, daySpan, chartWidth),
            y: yForAmount(paceAtMarker),
          }
        : null;

    const tickDays: string[] = [];
    const startDate = new Date(`${monthStart}T00:00:00`);
    const endDate = new Date(`${monthEnd}T00:00:00`);
    const dayCount = Math.round((lastDay - firstDay) / 86400000) + 1;
    const step = dayCount <= 7 ? 1 : dayCount <= 14 ? 2 : 7;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + step)) {
      tickDays.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }

    return {
      linePath,
      goalPaceLine,
      paceMarker,
      markerCoords,
      min,
      max,
      tickDays,
      firstDay,
      daySpan,
      monthStart,
      monthEnd,
      goalAmount,
      yForAmount,
    };
  }, [chartWidth, data, paceMarkerDate]);

  const hoveredPaceAmount =
    hoveredPaceDay && geometry?.goalAmount != null
      ? goalPaceAtDate(data.month, geometry.goalAmount, hoveredPaceDay)
      : null;

  const hoveredPaceCoord =
    hoveredPaceDay && geometry?.goalAmount != null && hoveredPaceAmount != null
      ? {
          x: xForDay(hoveredPaceDay, geometry.firstDay, geometry.daySpan, chartWidth),
          y: geometry.yForAmount(hoveredPaceAmount),
        }
      : null;

  const handlePaceLineHover = (event: ReactMouseEvent<SVGLineElement>) => {
    const svg = svgRef.current;
    if (!svg || geometry?.goalAmount == null) return;
    const x = clientXToSvgX(svg, event.clientX);
    const offset = dayOffsetFromX(x, geometry.daySpan, chartWidth);
    setHoveredPaceDay(isoDayFromOffset(data.monthStart, offset));
  };

  const handlePaceLineLeave = () => setHoveredPaceDay(null);

  const hoveredPoint = geometry?.markerCoords.find((c) => c.point.id === hoveredId)?.point;
  const selectedPoint = geometry?.markerCoords.find((c) => c.point.id === selectedId)?.point;

  if (!geometry || (data.points.length === 0 && data.goalAmount == null)) {
    return (
      <p className="text-sm text-muted">
        No earnings updates for {formatEarnedMonth(data.month)} yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-[200px] w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={ariaLabel}
        >
          {geometry.goalPaceLine ? (
            <>
              <line
                x1={geometry.goalPaceLine.x1}
                y1={geometry.goalPaceLine.y1}
                x2={geometry.goalPaceLine.x2}
                y2={geometry.goalPaceLine.y2}
                stroke="rgb(var(--muted))"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.7"
                pointerEvents="none"
              />
              <line
                x1={geometry.goalPaceLine.x1}
                y1={geometry.goalPaceLine.y1}
                x2={geometry.goalPaceLine.x2}
                y2={geometry.goalPaceLine.y2}
                stroke="rgb(var(--muted))"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.7"
                pointerEvents="none"
              />
            </>
          ) : null}

          {geometry.paceMarker ? (
            <circle
              cx={geometry.paceMarker.x}
              cy={geometry.paceMarker.y}
              r={3}
              fill="rgb(var(--muted))"
              opacity="0.85"
              pointerEvents="none"
            />
          ) : null}

          {geometry.linePath && data.points.length > 0 ? (
            <path
              d={geometry.linePath}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ) : null}

          {geometry.goalPaceLine ? (
            <line
              x1={geometry.goalPaceLine.x1}
              y1={geometry.goalPaceLine.y1}
              x2={geometry.goalPaceLine.x2}
              y2={geometry.goalPaceLine.y2}
              stroke="transparent"
              strokeWidth="14"
              className="cursor-crosshair"
              onMouseMove={handlePaceLineHover}
              onMouseLeave={handlePaceLineLeave}
            />
          ) : null}

          {hoveredPaceCoord ? (
            <circle
              cx={hoveredPaceCoord.x}
              cy={hoveredPaceCoord.y}
              r={4}
              fill="rgb(var(--surface))"
              stroke="rgb(var(--muted))"
              strokeWidth="1.5"
              pointerEvents="none"
            />
          ) : null}

          {geometry.tickDays.map((day, index) => {
            const x = xForDay(day, geometry.firstDay, geometry.daySpan, chartWidth);
            const anchor =
              index === 0 ? 'start' : index === geometry.tickDays.length - 1 ? 'end' : 'middle';
            return (
              <text
                key={day}
                x={x}
                y={HEIGHT - 6}
                textAnchor={anchor}
                className="fill-muted text-[10px]"
              >
                {new Date(`${day}T00:00:00`).getDate()}
              </text>
            );
          })}

          {geometry.markerCoords.map((coord) => (
            <g key={coord.point.id}>
              <circle
                cx={coord.x}
                cy={coord.y}
                r={hoveredId === coord.point.id || selectedId === coord.point.id ? 5 : 4}
                fill="rgb(var(--surface))"
                stroke="rgb(var(--accent))"
                strokeWidth="1.5"
                className="cursor-pointer"
                tabIndex={0}
                onMouseEnter={() => {
                  setHoveredId(coord.point.id);
                  setHoveredPaceDay(null);
                }}
                onMouseLeave={() =>
                  setHoveredId((current) => (current === coord.point.id ? null : current))
                }
                onFocus={() => setHoveredId(coord.point.id)}
                onBlur={() =>
                  setHoveredId((current) => (current === coord.point.id ? null : current))
                }
                onClick={() =>
                  setSelectedId((current) => (current === coord.point.id ? null : coord.point.id))
                }
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="rounded-md border border-border/70 bg-surface2/40 px-3 py-2 text-xs text-muted">
        {selectedPoint && onDeleteSnapshot ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {formatDisplayDate(selectedPoint.date)} ·{' '}
              <span className="font-semibold text-fg">
                {formatMoney(selectedPoint.totalAmount, currency)}
              </span>{' '}
              · {new Date(selectedPoint.recordedAt).toLocaleString()}
              {selectedPoint.note ? ` · ${selectedPoint.note}` : ''}
            </p>
            <button
              type="button"
              className="btn-ghost text-xs text-danger"
              onClick={() => {
                onDeleteSnapshot(selectedPoint.id);
                setSelectedId(null);
              }}
            >
              Delete point
            </button>
          </div>
        ) : hoveredPoint ? (
          <p>
            {formatDisplayDate(hoveredPoint.date)} ·{' '}
            <span className="font-semibold text-fg">
              {formatMoney(hoveredPoint.totalAmount, currency)}
            </span>{' '}
            · {new Date(hoveredPoint.recordedAt).toLocaleString()}
            {hoveredPoint.note ? ` · ${hoveredPoint.note}` : ''}
          </p>
        ) : hoveredPaceDay && hoveredPaceAmount != null ? (
          <p>
            {formatDisplayDate(hoveredPaceDay)} · Goal pace{' '}
            <span className="font-semibold text-fg">
              {formatMoney(hoveredPaceAmount, currency)}
            </span>
          </p>
        ) : (
          <p>
            {formatEarnedMonth(data.month)} · Hover the dashed goal pace or an earnings point for
            details.
          </p>
        )}
      </div>

      <div className="flex justify-between text-xs text-muted">
        <span>Low {formatMoney(geometry.min, currency)}</span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-muted" /> Goal pace
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent" /> Earnings
          </span>
        </span>
        <span>High {formatMoney(geometry.max, currency)}</span>
      </div>
    </div>
  );
}
