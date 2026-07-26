/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // one accent colour for primary actions; everything else neutral
        brand: {
          50: "#eefbf3",
          100: "#d6f5e2",
          200: "#b0e9c8",
          300: "#7dd7a7",
          400: "#46bd80",
          500: "#219f63",
          600: "#157f4f",
          700: "#126541",
          800: "#125136",
          900: "#10432e",
        },
      },
    },
  },
  plugins: [],
};
