/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        dark: {
          900: '#0d0d14',
          800: '#13131f',
          700: '#1a1a2e',
          600: '#222236',
          500: '#2d2d4a',
          400: '#3d3d5c',
        },
        connections: {
          yellow: '#f9e04b',
          green:  '#6aaa64',
          blue:   '#5b9bd5',
          purple: '#9b59b6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'flip-in': 'flipIn 0.3s ease-in-out',
        'shake': 'shake 0.4s ease-in-out',
        'pop': 'pop 0.1s ease-in-out',
        'bounce-in': 'bounceIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-border': 'pulseBorder 1.5s ease-in-out infinite',
      },
      keyframes: {
        flipIn: {
          '0%': { transform: 'rotateX(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0deg)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseBorder: {
          '0%, 100%': { borderColor: 'rgba(14,165,233,0.4)' },
          '50%': { borderColor: 'rgba(14,165,233,1)' },
        },
      },
    },
  },
  plugins: [],
};
