import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm neutrals shared with the product app (/web)
        cream: {
          50: '#FCFBF9',
          100: '#F7F5F0',
          200: '#EFEBE3',
          300: '#E3DED2',
          400: '#BBB5A9',
        },
        ink: {
          DEFAULT: '#1A1917',
          900: '#141312',
          800: '#252523',
          700: '#33302E',
          600: '#4A4744',
          500: '#6B6762',
          400: '#8C8880',
          300: '#B3AEA5',
        },
        // Product gold (btn-bump-gold in /web)
        gold: {
          DEFAULT: '#C9A66B',
          hover: '#D3B078',
          deep: '#8F7444',
          bright: '#FBBF24',
          soft: '#F3E9D7',
        },
        night: {
          DEFAULT: '#161513',
          card: '#211F1C',
          line: '#33302E',
          soft: '#9C968C',
        },
      },
      fontFamily: {
        // PolySans everywhere — same face as the stat numerals
        display: ['var(--font-polysans)', 'Inter', 'sans-serif'],
        sans: ['var(--font-polysans)', 'var(--font-inter)', 'Inter', 'sans-serif'],
        inter: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-polymono)', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        shell: '76rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,25,23,0.04), 0 6px 20px -10px rgba(26,25,23,0.08)',
        lift: '0 2px 4px rgba(26,25,23,0.04), 0 18px 40px -16px rgba(26,25,23,0.14)',
        input: '0 1px 2px rgba(26,25,23,0.05), 0 12px 36px -12px rgba(26,25,23,0.14)',
      },
      keyframes: {
        'edge-dash': {
          to: { strokeDashoffset: '-24' },
        },
      },
      animation: {
        'edge-dash': 'edge-dash 2.4s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
