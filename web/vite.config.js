import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // `npm run dev` pairs Vite with the API server on :3000 (see package.json).
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { target: "es2020" },
});
