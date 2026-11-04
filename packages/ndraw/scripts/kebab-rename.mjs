// One-shot codemod: rename every .ts/.tsx/.css file and directory under src/ to
// kebab-case, rewrite every relative and @excalidraw/* import that points at a
// renamed path (resolved against the old tree, emitted relative to the new
// homes), then git-mv. fonts/ and locales/ are untouched: their names are baked
// into runtime font URLs and the locale glob.
// usage: bun packages/ndraw/scripts/kebab-rename.mjs [--check]
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
// font family dirs hold the woff2 files whose paths the runtime font URL depends on;
// locales/*.json are loaded by name through the import glob. Both keep their names.
const hasWoff2 = (dir) => {
  const es = readdirSync(dir, { withFileTypes: true });
  if (es.some((e) => e.name.endsWith(".woff2"))) return true;
  return es.some((e) => e.isDirectory() && hasWoff2(path.join(dir, e.name)));
};
const skipDir = (dir) => hasWoff2(dir) || path.basename(dir) === "locales";
const check = process.argv.includes("--check");

const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

const walkAssets = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAssets(p, out);
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(p);
  }
  return out;
};

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!skipDir(p)) walk(p, out);
      else for (const f of walkAssets(p)) out.push(f);
    } else if (/\.(ts|tsx|css)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
};

const files = walk(src);
const renames = new Map(); // old abs path -> new abs path
for (const f of files) {
  const parsed = path.parse(f);
  const kb = kebab(parsed.name);
  if (kb !== parsed.name) renames.set(f, path.join(parsed.dir, kb + parsed.ext));
}
const dirs = [];
const collectDirs = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (!e.isDirectory() || skipDir(p)) continue;
    collectDirs(p);
    dirs.push(p);
  }
};
collectDirs(src);
for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
  const kb = kebab(path.basename(d));
  if (kb !== path.basename(d)) renames.set(d, path.join(path.dirname(d), kb));
}

// longest prefix first, and chained: a renamed file inside a renamed dir needs both
const keys = [...renames.keys()].sort((a, b) => b.length - a.length);
const mapPath = (p) => {
  let cur = p;
  for (let i = 0; i < 5; i++) {
    const k = keys.find((o) => cur === o || cur.startsWith(o + path.sep));
    if (!k) break;
    cur = renames.get(k) + cur.slice(k.length);
  }
  return cur === p ? null : cur;
};

const ordered = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);

const SPEC = /(from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g;
let touched = 0;
for (const f of walk(src)) {
  const text = readFileSync(f, "utf8");
  const dir = path.dirname(mapPath(f) ?? f); // specifiers are relative to the file's new home
  const next = text.replace(SPEC, (m, pre, spec) => {
    let target = null;
    let rebuild = null;
    if (spec.startsWith(".")) {
      target = path.resolve(path.dirname(f), spec); // resolve against the old tree, before the moves
    } else if (spec.startsWith("@excalidraw/")) {
      const rest = spec.slice("@excalidraw/".length);
      const pkg = rest.split("/")[0];
      const base = { excalidraw: "excalidraw", math: "math", utils: "utils" }[pkg];
      if (base) {
        const rel = rest.slice(pkg.length).replace(/^\//, "");
        target = path.join(src, base, rel);
        rebuild = (abs) => {
          const rel = path.relative(path.join(src, base), abs).split(path.sep).join("/");
          return `@excalidraw/${pkg}/${specExt ? rel : rel.replace(/\.(ts|tsx)$/, "")}`;
        };
      }
    }
    if (!target) return m;
    const specExt = path.parse(spec).ext;
    const candidates = [
      target,
      target + ".ts",
      target + ".tsx",
      target + ".css",
      target + ".json",
      path.join(target, "index.ts"),
      path.join(target, "index.tsx"),
    ];
    const hit = candidates.find((c) => statSync(c, { throwIfNoEntry: false })?.isFile());
    if (!hit) return m;
    const mapped = mapPath(hit);
    if (!mapped) return m;
    if (rebuild) return `${pre}"${rebuild(mapped)}"`;
    let rel = path.relative(dir, mapped).split(path.sep).join("/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    // mapped is a real file path: a .ts/.tsx tail is never wanted in a specifier (dot-suffixed
    // module names like WelcomeScreen.Center make path.parse().ext lie), asset extensions stay
    rel = rel.replace(/\.(ts|tsx)$/, "");
    return `${pre}"${rel}"`;
  });
  if (next !== text) {
    writeFileSync(f, next);
    touched++;
  }
}
console.log(`planned ${ordered.length} renames, rewrote imports in ${touched} files`);
if (check) {
  for (const [o, n] of ordered.slice(0, 10)) console.log(`  ${path.relative(root, o)} -> ${path.relative(root, n)}`);
  process.exit(0);
}

const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, stdio: "pipe" }).toString();
for (const [oldP, newP] of ordered) {
  // the filesystem is case-insensitive: a case-only rename needs a hop through a temp name
  if (oldP.toLowerCase() === newP.toLowerCase()) {
    const tmp = newP + ".kebab-tmp";
    git(`mv ${JSON.stringify(oldP)} ${JSON.stringify(tmp)}`);
    git(`mv ${JSON.stringify(tmp)} ${JSON.stringify(newP)}`);
  } else {
    git(`mv ${JSON.stringify(oldP)} ${JSON.stringify(newP)}`);
  }
}
console.log(`moved ${ordered.length} paths`);
