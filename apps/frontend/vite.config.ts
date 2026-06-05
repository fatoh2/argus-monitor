import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API target: in Docker, reach the api-service container by name; override via API_PROXY_TARGET
const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:3000";
const wsTarget = apiTarget.replace(/^http/, "ws");

const proxy = {
  "/api": { target: apiTarget, changeOrigin: true },
  "/ws": { target: wsTarget, ws: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 5173, host: true, proxy },
});
