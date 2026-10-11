/** @type {import('tailwindcss').Config} */
// DA « Route de vacances rétro » : papier de carte routière, encre bleu nuit,
// orange autoroute du soleil, jaune panneau, bleu ciel, vert pin.
// Les palettes stone / purple / emerald sont redéfinies pour re-teinter tout le jeu d'un coup.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Papier → encre : neutres chauds, le 900 est l'encre bleu nuit des cartes
        stone: {
          50: '#FDF8EC',
          100: '#F6ECD4',
          200: '#EBDDBC',
          300: '#D9C59C',
          400: '#B8A07A',
          500: '#8F7A5C',
          600: '#6E5D45',
          700: '#564834',
          800: '#2E3A57',
          900: '#1E2740',
        },
        // Défi & oracle : rouge brique des cartes Michelin
        purple: {
          50: '#FCEFEA',
          100: '#F8DDD3',
          200: '#F0BBA9',
          300: '#E39479',
          600: '#B3452B',
          700: '#963722',
          800: '#7A2C1C',
          900: '#5E2216',
          950: '#3F160E',
        },
        // Sur le vif : vert pin des panneaux de nationale
        emerald: {
          100: '#DCEBDF',
          700: '#2F6B4F',
          800: '#24553E',
        },
        chrono: {
          DEFAULT: '#F26B1D',
          dark: '#D4560F',
        },
        multi: {
          DEFAULT: '#2B6CB0',
          dark: '#1F5590',
        },
        sun: {
          DEFAULT: '#FFC93C',
          dark: '#E8AE14',
        },
        cream: {
          warm: '#F6ECD4',
          light: '#FDF8EC',
        },
        eu: '#003399',
        euStar: '#FFCC00',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        plate: ['"JetBrains Mono"', 'monospace'],
        // Overpass est dérivée de Highway Gothic, la typo des panneaux routiers
        body: ['Overpass', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
