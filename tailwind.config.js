/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      borderRadius: {
        'xl2': '1rem',
      },
      boxShadow: {
        'elev1':
          '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.04)',
        'elev2':
          '0 8px 24px -8px rgb(0 0 0 / 0.18), 0 2px 6px -2px rgb(0 0 0 / 0.08)',
        'glow-accent':
          '0 0 0 1px rgb(var(--accent) / 0.18), 0 12px 40px -12px rgb(var(--accent) / 0.55)',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--accent) / 0.6)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
