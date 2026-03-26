import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Noto Serif SC', 'serif'],
        body: ['DM Sans', 'sans-serif'],
        hanzi: ['Noto Sans SC', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f7f5f2',
          100: '#ede9e3',
          200: '#d9d2c7',
          300: '#c1b5a3',
          400: '#a6967e',
          500: '#8f7d65',
          600: '#7a6a57',
          700: '#645648',
          800: '#54483e',
          900: '#483f37',
          950: '#28221d',
        },
        vermillion: {
          50: '#fff1f0',
          100: '#ffe0dd',
          200: '#ffc6c1',
          300: '#ff9f96',
          400: '#ff6759',
          500: '#ff3726',
          600: '#ed1c0a',
          700: '#c71406',
          800: '#a4150b',
          900: '#871811',
          950: '#4b0703',
        },
        jade: {
          50: '#f0fdf6',
          100: '#dcfceb',
          200: '#bbf7d7',
          300: '#86efba',
          400: '#4ade94',
          500: '#22c572',
          600: '#16a35b',
          700: '#15804a',
          800: '#16653d',
          900: '#145334',
          950: '#052e1a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
