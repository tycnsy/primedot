interface RingProgressProps {
  percent: number;
  size?: number;
}

export default function RingProgress({ percent, size = 56 }: RingProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="img"
      aria-label={`${Math.round(clamped)}% complete`}
      className="relative inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(rgb(var(--accent)) ${clamped}%, rgb(var(--surface-2)) ${clamped}% 100%)`,
      }}
    >
      <div
        className="rounded-full bg-bg ring-1 ring-inset ring-border/70"
        style={{ width: size - 10, height: size - 10 }}
      />
    </div>
  );
}
