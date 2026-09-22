/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Semanticos: cambian solos con [data-theme]
        page: 'var(--bg)',
        panel: 'var(--bg-alt)',
        ink: 'var(--fg)',
        muted: 'var(--fg-suave)',
        line: 'var(--linea)',
        card: 'var(--card)',
        surface: 'var(--card-solid)',
        accent: 'var(--acento)',
        accent2: 'var(--acento-2)',
        activo: 'var(--activo)',
        violeta: 'var(--violeta)',

        // Paleta cruda UNAL
        papel: '#F6EEE8',
        'papel-2': '#E6E2D0',
        tinta: '#191114',
        'tinta-suave': '#907A67',
        unal: '#18514A',
        'unal-claro': '#3B908D',
        'unal-verde': '#82B475',
        dorado: '#C08A2E',
        noche: '#0E1F1B',
        'noche-2': '#152218',
        morado: '#8F7CC0',
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        glass: 'var(--glass-shadow)',
        'glass-lg': 'var(--glass-shadow-lg)',
        composer: '0 12px 40px -12px rgba(0,0,0,.45)',
      },
      maxWidth: {
        prose: '46rem',
      },
      transitionTimingFunction: {
        suave: 'cubic-bezier(.22,1,.36,1)',
      },
      animation: {
        'fade-in': 'fadeIn .3s ease forwards',
        'slide-up': 'slideUp .4s cubic-bezier(.22,1,.36,1) forwards',
        'modal-in': 'modalIn .32s cubic-bezier(.22,1,.36,1) forwards',
        'dropdown-in': 'dropdownIn .18s cubic-bezier(.22,1,.36,1) forwards',
        'toast-in': 'toastIn .3s cubic-bezier(.22,1,.36,1) forwards',
        flotar: 'flotar 16s ease-in-out infinite alternate',
        escribir: 'escribir 1.35s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        modalIn: {
          from: { opacity: '0', transform: 'translateY(14px) scale(.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        dropdownIn: {
          from: { opacity: '0', transform: 'translateY(-6px) scale(.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translate(-50%, 16px)' },
          to: { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        flotar: {
          from: { transform: 'translate(0,0) scale(1)' },
          to: { transform: 'translate(4%,-6%) scale(1.12)' },
        },
        escribir: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '.35' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}