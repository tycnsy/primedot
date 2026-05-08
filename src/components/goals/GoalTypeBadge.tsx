import type { GoalType } from '../../features/goals';

interface GoalTypeBadgeProps {
  type: GoalType | 'daily' | 'weekly';
}

const TYPE_STYLES: Record<GoalTypeBadgeProps['type'], string> = {
  trend: 'text-[#2563eb] bg-[rgba(37,99,235,0.10)] border-[rgba(37,99,235,0.28)]',
  accumulation: 'text-[#21A06A] bg-[rgba(33,160,106,0.10)] border-[rgba(33,160,106,0.30)]',
  milestone: 'text-[#7B5EE6] bg-[rgba(123,94,230,0.10)] border-[rgba(123,94,230,0.30)]',
  daily: 'text-muted bg-surface2 border-border',
  weekly: 'text-muted bg-surface2 border-border',
};

function TypeIcon({ type }: { type: GoalTypeBadgeProps['type'] }) {
  if (type === 'trend') {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
        <path d="M2 10.5 5.1 7.4l2 2L12 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'accumulation') {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
        <path d="M2.5 11V7.8M6.8 11V5.2M11 11V3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'milestone') {
    return (
      <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function GoalTypeBadge({ type }: GoalTypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${TYPE_STYLES[type]}`}
    >
      <TypeIcon type={type} />
      {type}
    </span>
  );
}
