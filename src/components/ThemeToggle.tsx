import { useTheme, type Theme } from '../contexts/ThemeContext';

const items: { value: Theme; label: string; icon: JSX.Element }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'warm',
    label: 'Warm',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <path
          d="M5 15.5c0-3.3 3-6 6.8-6 3.8 0 7.2 2.5 7.2 6s-3.1 6-7 6h-4.5A2.5 2.5 0 0 1 5 19v-3.5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 9.4c-.2-1.9 1.1-3.8 3.4-4.3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: 'grey',
    label: 'Grey',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 4a8 8 0 0 1 0 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <rect
          x="3"
          y="4"
          width="18"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M9 21h6M12 17v4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className="segmented p-0.5"
      role="radiogroup"
      aria-label="Color theme"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={theme === item.value}
          aria-label={item.label}
          title={item.label}
          data-active={theme === item.value}
          onClick={() => setTheme(item.value)}
          className="!px-2 !py-1"
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
