/* global process, console */
// Runs a TypeScript module of this project in Node through Vite's SSR loader,
// so the build's own extension-less imports resolve exactly as they do in the
// app. Usage: node scripts/run-ts.mjs <module.ts> [args...]
//
// The module's default export is called with the remaining arguments.

import { createServer } from "vite";

const [entry, ...args] = process.argv.slice(2);
if (entry === undefined) {
  console.error("usage: node scripts/run-ts.mjs <module.ts> [args...]");
  process.exit(2);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  logLevel: "error",
});
try {
  const mod = await server.ssrLoadModule(entry);
  await mod.default(...args);
} finally {
  await server.close();
}
