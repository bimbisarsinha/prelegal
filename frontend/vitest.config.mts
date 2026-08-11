import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` alias from tsconfig.json, so tests import modules by the
  // same path the app does.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["{app,components,lib,test}/**/*.test.{ts,tsx}"],
    root: import.meta.dirname,
    // `root` above scopes which files are collected; it does not change the
    // process's working directory, which is what lib/templates.ts resolves
    // templates/ against. globalSetup does that, so the suite holds up wherever
    // the runner was invoked from.
    globalSetup: ["./test/globalSetup.ts"],
  },
});
