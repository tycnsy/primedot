interface TagPillProps {
  name: string;
  color?: string | null;
}

const DEFAULT_TAG_COLOR = '#9CA3AF';

export default function TagPill({ name, color }: TagPillProps) {
  return (
    <span className="pill gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color?.trim() || DEFAULT_TAG_COLOR }}
        aria-hidden
      />
      <span>{name}</span>
    </span>
  );
}
