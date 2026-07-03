/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chrono: {
          DEFAULT: '#d32f2f',
          dark: '#b71c1c',
        },
        multi: {
          DEFAULT: '#003399',
          dark: '#001f5c',
        },
        cream: {
          warm: '#fde9c1',
          light: '#fff4dc',
        },
        sky: {
          warm: '#b8d8e0',
        },
        eu: '#003399',
        euStar: '#FFCC00',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        plate: ['"JetBrains Mono"', 'monospace'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cream': 'linear-gradient(to bottom, #fde9c1, #fff4dc)',
        'gradient-lobby': 'linear-gradient(to bottom, #fde9c1, #b8d8e0)',
        'gradient-home': 'linear-gradient(to bottom, #fde9c1 0%, #fff4dc 50%, #b8d8e0 100%)',
      },
    },
  },
  plugins: [],
};
