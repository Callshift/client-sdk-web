// Packs @callshift/web as it will be published and checks the tarball: only
// the build, its types, the README, the LICENSE and package.json; dependency
// versions npm can install; an entry point that loads once installed.
// Prints the tarball's path, which the release publishes as is.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(packageDir, ".pack");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

const run = (command, args, cwd = packageDir) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }); // NOSONAR: the developer's own pnpm and tar

run("pnpm", ["pack", "--pack-destination", outDir]);
const [tarball] = readdirSync(outDir);
const tarballPath = join(outDir, tarball);

const files = run("tar", ["-tzf", tarballPath])
  .split("\n")
  .filter(Boolean)
  .map((path) => path.replace(/^package\//, ""));
const manifest = JSON.parse(
  run("tar", ["-xzOf", tarballPath, "package/package.json"]),
);
const problems = [];

for (const required of [
  "dist/index.js",
  "dist/index.d.ts",
  "README.md",
  "LICENSE",
]) {
  if (!files.includes(required)) problems.push(`missing ${required}`);
}
for (const path of files) {
  const shipped =
    path.startsWith("dist/") ||
    ["README.md", "LICENSE", "package.json"].includes(path);
  if (!shipped || /\.test\.|__simulators__/.test(path)) {
    problems.push(`would ship ${path}`);
  }
}
for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
  if (/^(catalog|workspace):/.test(range)) {
    problems.push(`dependency ${name} is "${range}", which npm cannot install`);
  }
}

// Installed from the tarball, as a tenant would.
const consumer = mkdtempSync(join(tmpdir(), "callshift-web-"));
try {
  run("npm", ["init", "-y"], consumer);
  run("npm", ["install", "--no-audit", "--no-fund", tarballPath], consumer);
  const entry = run(
    "node",
    [
      "--input-type=module",
      "-e",
      'const m = await import("@callshift/web"); console.log(Object.keys(m).join(","))',
    ],
    consumer,
  ).trim();
  for (const name of ["CallshiftWebCall", "CallshiftWebCallError"]) {
    if (!entry.split(",").includes(name)) problems.push(`no export ${name}`);
  }
} finally {
  rmSync(consumer, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(
    `@callshift/web is not ready to publish:\n- ${problems.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(tarballPath);
