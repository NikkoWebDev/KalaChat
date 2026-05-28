/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['Satoshi', 'SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0C0C0E',
          50: '#F5F5F0',
          100: '#EDEDEF',
          200: '#8E8E96',
          300: '#5E5E66',
          400: '#161618',
          500: '#1E1E22',
          600: '#242428',
          700: '#26262B',
          800: '#1C1C20',
        },
        gold: {
          DEFAULT: '#C8A87C',
          50: '#DCC09C',
          100: '#A8855A',
        },
      },
      animation: {
        'message-slide': 'messageSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.25s ease forwards',
        'modal-in': 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'dropdown-in': 'dropdownIn 0.2s ease forwards',
        'toast-in': 'toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-out': 'toastOut 0.3s ease 2.2s forwards',
        'pulse-dot': 'typingBounce 1.4s ease-in-out infinite',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'chevron-spin': 'chevronSpin 0.25s ease forwards',
      },
      keyframes: {
        messageSlide: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        modalIn: {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        dropdownIn: {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateX(-50%) translateY(16px)' },
          to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        toastOut: {
          from: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          to: { opacity: '0', transform: 'translateX(-50%) translateY(-12px)' },
        },
        typingBounce: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-6px)', opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
