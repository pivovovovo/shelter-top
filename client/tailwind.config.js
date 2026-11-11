/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bunker: {
          bg: '#1a1612',        // Тёплый тёмно-коричневый
          surface: '#25201a',   // Поверхность карточек
          surface2: '#2f2921',  // Вложенные блоки
          border: '#3d352a',    // Границы
          text: '#ede4d3',      // Тёплый белый
          muted: '#a89a82',     // Вторичный текст

          amber: '#d4a04a',     // Основной акцент (янтарь)
          green: '#7ab87a',     // Успех (приглушённый)
          red: '#c94b4b',       // Опасность (кирпичный)
          purple: '#8a6d9e',    // Карты действий
          gold: '#e8b44e',      // Сильные карты, хост
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'xl2': '16px',
      },
      boxShadow: {
        'warm-sm': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'warm-md': '0 4px 16px rgba(0, 0, 0, 0.4)',
        'warm-lg': '0 8px 24px rgba(0, 0, 0, 0.5)',
        'amber-glow': '0 0 15px rgba(212, 160, 74, 0.15)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}