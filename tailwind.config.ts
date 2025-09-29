import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "sm-soft": "0 1px 2px rgba(16,24,40,.06)",
        "md-soft": "0 4px 12px rgba(16,24,40,.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;

