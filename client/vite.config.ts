import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readRootEnv() {
  const envPath = path.resolve(here, "..", ".env");
  if (!fs.existsSync(envPath)) return new Map<string, string>();

  const entries = new Map<string, string>();
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    entries.set(key, rawValue.replace(/^['"]|['"]$/g, ""));
  }
  return entries;
}

function getBackendOrigin(rootEnv: Map<string, string>) {
  const explicit =
    process.env.DOCKERMANAGER_BACKEND_ORIGIN ||
    rootEnv.get("DOCKERMANAGER_BACKEND_ORIGIN");
  if (explicit) return explicit.replace(/\/$/, "");

  const host = process.env.HOST || rootEnv.get("HOST") || "127.0.0.1";
  const port = process.env.PORT || rootEnv.get("PORT") || "22443";
  const normalizedHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${normalizedHost}:${port}`;
}

function getFrontendPort(rootEnv: Map<string, string>) {
  return parseInt(
    process.env.FRONTEND_PORT || rootEnv.get("FRONTEND_PORT") || "22080",
    10,
  );
}

function getApiToken(rootEnv: Map<string, string>) {
  return process.env.DOCKERMANAGER_API_TOKEN || rootEnv.get("DOCKERMANAGER_API_TOKEN") || "dev-token";
}

const rootEnv = readRootEnv();
const backendOrigin = getBackendOrigin(rootEnv);
const frontendPort = getFrontendPort(rootEnv);
const apiToken = getApiToken(rootEnv);

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  define: {
    "import.meta.env.VITE_DOCKERMANAGER_API_TOKEN": JSON.stringify(apiToken),
    "import.meta.env.VITE_DOCKERMANAGER_BACKEND_ORIGIN": JSON.stringify(backendOrigin),
    "import.meta.env.VITE_DEFAULT_WORKSPACE_ROOT": JSON.stringify("docker-yaml-files"),
  },
  server: {
    port: frontendPort,
    proxy: {
      "/api": { target: backendOrigin, changeOrigin: true },
      "/socket.io": { target: backendOrigin, ws: true, changeOrigin: true },
    },
  },
});
