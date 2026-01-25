import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular'],
        technical: ['Roboto', 'sans-serif'],
      },
      colors: {
        'executive': {
          'primary': '#334155', // Indigo/Slate 700
          'background': '#F1F5F9', // Soft Grey/Slate 100
          'surface': '#FFFFFF',
          'success': '#059669', // Deep Teal
          'warning': '#D97706', // Muted Amber
          'info': '#2563EB', // Clear Blue
        }
      },
      borderRadius: {
        'executive': '12px'
      }
    },
  },
  plugins: [require('tailwindcss-primeui')],
} satisfies Config
