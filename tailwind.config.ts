import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bordo: {
          DEFAULT: '#7B2D3B',
          dark: '#5e2230',
          light: '#96404f',
          glow: '#b05263',
        },
        gold: {
          DEFAULT: '#d8b677',
          light: '#e8d0a4',
          dim: '#a8894f',
        },
        ink: {
          DEFAULT: '#120d0e',
          soft: '#1a1315',
          card: '#211719',
          hover: '#2a1d20',
          border: '#372a2d',
        },
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
