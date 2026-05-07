interface CheckProps {
  on: boolean;
  onClick: () => void;
  size?: number;
  label: string;
}

export default function Check({ on, onClick, size = 22, label }: CheckProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`inline-flex items-center justify-center rounded-md border transition-[background-color,border-color] duration-150 [transition-timing-function:cubic-bezier(.2,.8,.2,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        on ? 'border-accent bg-accent text-white' : 'border-border bg-surface2 text-muted'
      }`}
      style={{ width: size, height: size, borderWidth: 1.5 }}
    >
      {on ? (
        <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden>
          <path
            d="M3 7.5 5.6 10 11 4.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}
