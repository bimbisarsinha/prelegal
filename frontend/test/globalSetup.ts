/**
 * Run the suite from the app directory.
 *
 * `lib/templates.ts` resolves `templates/` from `process.cwd()`, the way
 * `next build` does. Vite's `root` option does not change the process's working
 * directory, so without this the real-file tests break the moment the runner is
 * invoked from anywhere but this directory — a monorepo task runner, or
 * `vitest --root frontend` from the repository root.
 */
export default function setup() {
  process.chdir(import.meta.dirname + "/..");
}
