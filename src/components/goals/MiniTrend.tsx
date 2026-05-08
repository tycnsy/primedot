import { useMemo } from 'react';
import type { TrendGoal } from '../../features/goals';

interface MiniTrendProps {
  goal: TrendGoal;
  height?: number;
  showPaceLine?: boolean;
}

export default function MiniTrend({ goal, height = 66, showPaceLine = true }: MiniTrendProps) {
  const width = 280;
  const padL = 4;
  const padR = 4;
  const padT = 4;
  const padB = 4;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const { points, areaPath, linePath, pace } = useMemo(() => {
    const t0 = new Date(goal.startDate).getTime();
    const t1 = new Date(goal.targetDate).getTime();
    const sorted = [...goal.logs].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const values = [goal.startValue, goal.targetValue, ...sorted.map((log) => log.value ?? goal.startValue)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.15 || 1;
    const yMin = min - pad;
    const yMax = max + pad;

    const xOf = (t: number) => padL + ((t - t0) / ((t1 - t0) || 1)) * innerW;
    const yOf = (v: number) => padT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * innerH;

    const pts = sorted.map((log) => ({
      x: xOf(new Date(log.at).getTime()),
      y: yOf(log.value ?? goal.startValue),
    }));

    const compactLinePath = pts
      .map((point, idx) => `${idx === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' ');
    const compactAreaPath =
      pts.length > 1
        ? `${compactLinePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
        : '';

    return {
      points: pts,
      linePath: compactLinePath,
      areaPath: compactAreaPath,
      pace: {
        x1: xOf(t0),
        y1: yOf(goal.startValue),
        x2: xOf(t1),
        y2: yOf(goal.targetValue),
      },
    };
  }, [goal, innerH, innerW]);

  return (
    <div className="mt-1 w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
      >
        <defs>
          <linearGradient id={`mini-trend-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {showPaceLine ? (
          <line
            x1={pace.x1}
            y1={pace.y1}
            x2={pace.x2}
            y2={pace.y2}
            stroke="rgb(var(--muted))"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.55"
          />
        ) : null}
        {points.length > 1 ? (
          <path d={areaPath} fill={`url(#mini-trend-${goal.id})`} />
        ) : null}
        {points.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((point, idx) => (
          <circle key={`${goal.id}-${idx}`} cx={point.x} cy={point.y} r="2" fill="rgb(var(--accent))" />
        ))}
      </svg>
    </div>
  );
}
