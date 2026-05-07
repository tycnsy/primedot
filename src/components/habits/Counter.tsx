interface CounterProps {
  value: number;
  target?: number;
  onChange: (n: number) => void;
  unit?: string;
}

export default function Counter({ value, target, onChange, unit }: CounterProps) {
  const displayTarget = target ?? '∞';

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-surface2 px-1.5 py-1 ring-1 ring-inset ring-border">
      <button
        type="button"
        aria-label={`Decrease count${unit ? ` (${unit})` : ''}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="btn-ghost !h-7 !w-7 !rounded-full !p-0"
      >
        −
      </button>
      <span className="min-w-20 text-center text-xs font-medium tabular-nums text-fg">
        {value}/{displayTarget}
      </span>
      <button
        type="button"
        aria-label={`Increase count${unit ? ` (${unit})` : ''}`}
        onClick={() => onChange(value + 1)}
        className="btn-ghost !h-7 !w-7 !rounded-full !p-0"
      >
        +
      </button>
    </div>
  );
}
