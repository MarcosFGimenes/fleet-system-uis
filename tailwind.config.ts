import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#f9fafb",
          subtle: "#f3f4f6",
        },
        foreground: {
          DEFAULT: "#111827",
          muted: "#4b5563",
        },
        border: {
          DEFAULT: "#e5e7eb",
        },
        focus: {
          DEFAULT: "#2563eb",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.08), 0 10px 15px -10px rgba(15, 23, 42, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
