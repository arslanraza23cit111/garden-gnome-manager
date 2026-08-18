import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local only: the SPA talks to the Express API on the same PC.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      "/api": { target: "http://localhost:5174", changeOrigin: true },
    },
  },
});
