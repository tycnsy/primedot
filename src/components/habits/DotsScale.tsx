interface DotsScaleProps {
  value: number;
  max?: number;
  onChange: (n: number) => void;
  label: string;
}

export default function DotsScale({
  value,
  max = 5,
  onChange,
  label,
}: DotsScaleProps) {
  const dots = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="inline-flex items-center gap-1.5">
      {dots.map((dot) => {
        const filled = dot <= value;
        return (
          <button
            key={dot}
            type="button"
            aria-label={`${label}: set ${dot} of ${max}`}
            aria-pressed={filled}
            onClick={() => onChange(filled && dot === value ? 0 : dot)}
            className={`h-4 w-4 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
              filled ? 'bg-accent' : 'bg-surface2 ring-1 ring-inset ring-border'
            }`}
          />
        );
      })}
    </div>
  );
}
