import fs from 'fs';

/** @type {import('tailwindcss').Config} */

let theme = {};
try {
  const themePath = './theme.json';
  if (fs.existsSync(themePath)) {
    theme = JSON.parse(fs.readFileSync(themePath, 'utf-8'));
  }
} catch (err) {
  console.error('failed to parse custom styles', err);
}

const defaultTheme = {
  container: {
    center: true,
    padding: '2rem',
  },
  extend: {
    colors: {
      neutral: {
        1: 'var(--color-neutral-1)',
        2: 'var(--color-neutral-2)',
        3: 'var(--color-neutral-3)',
        4: 'var(--color-neutral-4)',
        5: 'var(--color-neutral-5)',
        6: 'var(--color-neutral-6)',
        7: 'var(--color-neutral-7)',
        8: 'var(--color-neutral-8)',
        9: 'var(--color-neutral-9)',
        10: 'var(--color-neutral-10)',
        11: 'var(--color-neutral-11)',
        12: 'var(--color-neutral-12)',
        contrast: 'var(--color-neutral-contrast)',
      },
      accent: {
        1: 'var(--color-accent-1)',
        2: 'var(--color-accent-2)',
        3: 'var(--color-accent-3)',
        4: 'var(--color-accent-4)',
        5: 'var(--color-accent-5)',
        6: 'var(--color-accent-6)',
        7: 'var(--color-accent-7)',
        8: 'var(--color-accent-8)',
        9: 'var(--color-accent-9)',
        10: 'var(--color-accent-10)',
        11: 'var(--color-accent-11)',
        12: 'var(--color-accent-12)',
        contrast: 'var(--color-accent-contrast)',
      },
      fg: {
        DEFAULT: 'var(--color-fg)',
        secondary: 'var(--color-fg-secondary)',
      },
      bg: {
        DEFAULT: 'var(--color-bg)',
        inset: 'var(--color-bg-inset)',
        overlay: 'var(--color-bg-overlay)',
      },
      'focus-ring': 'var(--color-focus-ring)',
      surface: {
        DEFAULT: 'var(--surface)',
        muted: 'var(--surface-muted)',
        subtle: 'var(--surface-subtle)',
        elevated: 'var(--surface-elevated)',
      },
      header: {
        DEFAULT: 'var(--header)',
        foreground: 'var(--header-foreground)',
        border: 'var(--header-border)',
      },
      success: {
        DEFAULT: 'var(--success)',
        foreground: 'var(--success-foreground)',
        subtle: 'var(--success-subtle)',
      },
      warning: {
        DEFAULT: 'var(--warning)',
        foreground: 'var(--warning-foreground)',
        subtle: 'var(--warning-subtle)',
      },
      info: {
        DEFAULT: 'var(--info)',
        subtle: 'var(--info-subtle)',
      },
      'border-strong': 'var(--border-strong)',
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      full: 'var(--radius-full)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    boxShadow: {
      xs: 'var(--shadow-xs)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      xl: 'var(--shadow-xl)',
      ring: 'var(--shadow-ring)',
    },
    keyframes: {
      'fade-in': {
        from: { opacity: '0' },
        to: { opacity: '1' },
      },
      'slide-in-right': {
        from: { transform: 'translateX(100%)' },
        to: { transform: 'translateX(0)' },
      },
      'slide-up': {
        from: { transform: 'translateY(8px)', opacity: '0' },
        to: { transform: 'translateY(0)', opacity: '1' },
      },
    },
    animation: {
      'fade-in': 'fade-in 200ms ease-out',
      'slide-in-right': 'slide-in-right 200ms ease-out',
      'slide-up': 'slide-up 200ms ease-out',
    },
  },
  spacing: {
    px: 'var(--size-px)',
    0: 'var(--size-0)',
    0.5: 'var(--size-0-5)',
    1: 'var(--size-1)',
    1.5: 'var(--size-1-5)',
    2: 'var(--size-2)',
    2.5: 'var(--size-2-5)',
    3: 'var(--size-3)',
    3.5: 'var(--size-3-5)',
    4: 'var(--size-4)',
    5: 'var(--size-5)',
    6: 'var(--size-6)',
    7: 'var(--size-7)',
    8: 'var(--size-8)',
    9: 'var(--size-9)',
    10: 'var(--size-10)',
    11: 'var(--size-11)',
    12: 'var(--size-12)',
    14: 'var(--size-14)',
    16: 'var(--size-16)',
    20: 'var(--size-20)',
    24: 'var(--size-24)',
    28: 'var(--size-28)',
    32: 'var(--size-32)',
    36: 'var(--size-36)',
    40: 'var(--size-40)',
    44: 'var(--size-44)',
    48: 'var(--size-48)',
    52: 'var(--size-52)',
    56: 'var(--size-56)',
    60: 'var(--size-60)',
    64: 'var(--size-64)',
    72: 'var(--size-72)',
    80: 'var(--size-80)',
    96: 'var(--size-96)',
  },
  darkMode: ['selector', '[data-appearance="dark"]'],
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { ...defaultTheme, ...theme },
};
