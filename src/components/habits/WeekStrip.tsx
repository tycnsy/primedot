import type { DayState } from '../../features/habits/types';

interface WeekStripProps {
  data: DayState[];
  todayIdx: number;
  size?: number;
}

const stateClass: Record<DayState, string> = {
  done: 'bg-accent',
  partial: 'bg-accent/55',
  skip: 'bg-muted/45',
  idle: 'bg-surface2 ring-1 ring-inset ring-border',
  future: 'bg-transparent ring-1 ring-inset ring-border/60',
};

export default function WeekStrip({ data, todayIdx, size = 12 }: WeekStripProps) {
  return (
    <div className="inline-flex items-center gap-1">
      {data.slice(0, 7).map((state, i) => {
        const isToday = i === todayIdx;
        return (
          <span
            key={`${state}-${i}`}
            aria-hidden
            className={`inline-block rounded-[5px] ${stateClass[state]} ${
              isToday ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg' : ''
            }`}
            style={{ width: size, height: size }}
          />
        );
      })}
    </div>
  );
}
