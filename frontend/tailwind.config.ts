import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        foreground: 'var(--color-foreground)',
        muted: 'var(--color-muted)',
        subtle: 'var(--color-subtle)',
        border: 'var(--color-border)',
        primary: 'var(--color-primary)',
        primaryForeground: 'var(--color-primary-foreground)',
        danger: 'var(--color-danger)',
        dangerForeground: 'var(--color-danger-foreground)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)'
      },
      borderRadius: {
        ui: 'var(--radius-ui)',
        control: 'var(--radius-control)'
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        focus: 'var(--shadow-focus)'
      },
      fontFamily: {
        sans: 'var(--font-sans)'
      }
    }
  },
  plugins: []
} satisfies Config
