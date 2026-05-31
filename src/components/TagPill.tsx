import type { CSSProperties } from 'react';

interface TagPillProps {
  name: string;
  color?: string | null;
}

const DEFAULT_TAG_COLOR = '#9CA3AF';

export default function TagPill({ name, color }: TagPillProps) {
  const pillColor = color?.trim() || DEFAULT_TAG_COLOR;
  const style: CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${pillColor} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${pillColor} 42%, transparent)`,
    color: `color-mix(in srgb, ${pillColor} 78%, var(--fg) 22%)`,
  };

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={style}
    >
      {name}
    </span>
  );
}
