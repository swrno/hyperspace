import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        tertiary: 'var(--bg-tertiary)',
        sidebar: 'var(--bg-sidebar)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',

        txt: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverted: 'var(--text-inverted)',
        },

        border: {
          light: 'var(--border-light)',
          medium: 'var(--border-medium)',
          dark: 'var(--border-dark)',
        },

        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          light: 'var(--accent-light)',
        },

        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },
      fontFamily: {
        sans: ['"Theater Basel Grotesk"', 'sans-serif'],
        body: ['"Theater Basel Grotesk"', 'sans-serif'],
        mono: ['"Geist Mono"', 'JetBrains Mono', 'monospace'],
        martina: ['"Martina Plantijn"', 'serif'],
        basel: ['"Theater Basel Grotesk"', 'sans-serif'],
        geist: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        'geist-mono': ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
    },
  },
  plugins: [tailwindcssAnimate, require('@tailwindcss/typography')],
} satisfies Config;
