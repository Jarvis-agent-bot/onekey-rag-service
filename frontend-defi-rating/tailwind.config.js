/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Risk level colors
        'risk-low': '#10b981',
        'risk-medium': '#f59e0b',
        'risk-high': '#ef4444',
        'risk-critical': '#7f1d1d',
      },
    },
  },
  plugins: [],
}
