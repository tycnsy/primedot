import type { Tag } from '../../features/goals';

interface TagChipProps {
  tag: Tag;
}

export default function TagChip({ tag }: TagChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-2 py-1 text-[11px] font-medium text-muted">
      <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />
      {tag.name}
    </span>
  );
}
