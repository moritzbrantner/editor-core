// Mirrors the frontend half of a `create-tauri-app` React template; no Rust build runs here.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: ["es2021", "chrome105", "safari15"] },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  plugins: [react()],
  server: { port: 1420, strictPort: true },
});
