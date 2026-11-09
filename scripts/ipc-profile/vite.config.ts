// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  resolve: { alias: { "@": path.resolve(root, "../../src") } },
  define: {
    __ESTATE_IPC_BASE_URL__: JSON.stringify(process.env.ESTATE_IPC_BASE_URL),
    __ESTATE_IPC_TREE__: JSON.stringify(process.env.ESTATE_IPC_TREE),
  },
  build: {
    target: "es2022",
    outDir: process.env.ESTATE_IPC_DIST,
    emptyOutDir: true,
  },
});
