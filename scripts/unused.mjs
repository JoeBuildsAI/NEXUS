// Lists source modules that are never imported anywhere (excluding entrypoints/tests).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
})("src");
const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
for (const f of files) {
  if (/\.test\.tsx?$|main\.tsx$|vite-env|__fixtures__/.test(f)) continue;
  const base = basename(f).replace(/\.(ts|tsx)$/, "");
  if (base === "index") continue;
  const needle = `/${base}"`;
  const needle2 = `/${base}'`;
  if (!all.includes(needle) && !all.includes(needle2)) console.log("UNREFERENCED:", f);
}
