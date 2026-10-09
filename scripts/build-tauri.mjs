import { spawn } from "node:child_process";
import { access, rename } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const apiDir = path.join(root, "app", "api");
const backupDir = path.join(root, ".tauri-build-next-api");
const nextBin = require.resolve("next/dist/bin/next");

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        TAURI_BUILD: "1",
      },
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Next.js build terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

if (await exists(backupDir)) {
  throw new Error(
    "Found stale .tauri-build-next-api. Restore/remove it before building again."
  );
}

const hasApiRoutes = await exists(apiDir);

try {
  // Tauri embeds static assets. Next Route Handlers require a Node server,
  // so keep them for the web build but temporarily exclude them here.
  if (hasApiRoutes) {
    await rename(apiDir, backupDir);
  }

  const exitCode = await runNextBuild();
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  if (hasApiRoutes && (await exists(backupDir))) {
    await rename(backupDir, apiDir);
  }
}
