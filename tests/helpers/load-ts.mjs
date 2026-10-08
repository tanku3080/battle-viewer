import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();

export function loadTs(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const compiled = { exports: {} };
  cache.set(filename, compiled);

  if (filename.endsWith(".json")) {
    compiled.exports = JSON.parse(fs.readFileSync(filename, "utf8"));
    cache.set(filename, compiled);
    return compiled.exports;
  }

  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;

  const require = (specifier) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
      return nodeRequire(specifier);
    }

    const target = specifier.startsWith("@/")
      ? path.resolve(process.cwd(), specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    const resolved = [
      target,
      target + ".ts",
      target + ".tsx",
      target + ".json",
    ].find((file) => fs.existsSync(file));

    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${filename}`);
    return loadTs(resolved);
  };

  new Function("exports", "module", "require", output)(
    compiled.exports,
    compiled,
    require
  );
  return compiled.exports;
}
