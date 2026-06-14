/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette is themeable at runtime via CSS variables (see index.css
        // + lib/branding.js). Default theme is the "apothecary" emerald.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
        sage: {
          50: "#f6f7f5",
          100: "#e9ece6",
          200: "#d3dacd",
          300: "#b0bda6",
          400: "#879a79",
          500: "#677c58",
          600: "#506244",
          700: "#404e38",
          800: "#353f30",
          900: "#2d352a",
          950: "#161b14",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgba(16,24,40,0.08), 0 4px 24px -4px rgba(16,24,40,0.06)",
      },
    },
  },
  plugins: [],
};
