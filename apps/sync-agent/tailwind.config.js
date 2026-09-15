/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        "brand-deep": "#0A2E4A",
        "brand-tint": "#E8F1F8",
        ink: "#0F172A",
        "ink-soft": "#475569",
      },
    },
  },
  plugins: [],
};
