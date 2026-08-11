import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_FILES, realTemplates } from "@/test/support";

/**
 * `lib/templates.ts` resolves `templates/` from `process.cwd()`, the way
 * `next build` does. The vitest root is pinned to the app directory so that
 * path holds here too.
 */

const readFile = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile, default: { readFile } }));

async function loadTemplates() {
  // Imported per test so each one sees its own mock behaviour.
  const loader = await import("./templates");
  return loader.loadTemplates();
}

/** Hand the real files back, as the unmocked implementation would. */
function serveRealFiles() {
  readFile.mockImplementation(async (file: string) => readFileSync(file, "utf8"));
}

afterEach(() => {
  vi.resetModules();
  readFile.mockReset();
});

describe("loadTemplates", () => {
  it("reads both halves of the agreement", async () => {
    serveRealFiles();
    const templates = await loadTemplates();
    expect(templates.coverPage).toContain("# Mutual Non-Disclosure Agreement");
    expect(templates.standardTerms).toContain("# Standard Terms");
  });

  /** The legal text lives in `templates/` and is never copied into the app. */
  it("returns the repository's files byte for byte", async () => {
    serveRealFiles();
    const templates = await loadTemplates();
    expect(templates).toEqual(realTemplates());
  });

  it("reads the cover page and the standard terms from templates/", async () => {
    serveRealFiles();
    await loadTemplates();
    const requested = readFile.mock.calls.map(([file]) => String(file).replace(/\\/g, "/"));
    expect(requested).toHaveLength(2);
    expect(requested.some((file) => file.endsWith("/templates/mutual-nda-coverpage.md"))).toBe(true);
    expect(requested.some((file) => file.endsWith("/templates/mutual-nda.md"))).toBe(true);
  });

  it("reads as UTF-8, so the template's typographic quotes survive", async () => {
    serveRealFiles();
    const templates = await loadTemplates();
    for (const [, encoding] of readFile.mock.calls) {
      expect(encoding).toBe("utf8");
    }
    expect(templates.coverPage).toContain("“**Cover Page**”");
  });

  it("explains itself when a template is missing", async () => {
    readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    await expect(loadTemplates()).rejects.toThrow(/Could not read the MNDA template at/);
    await expect(loadTemplates()).rejects.toThrow(
      /reads the agreement text from the repository's templates\/ directory/,
    );
  });

  it("keeps the underlying failure as the cause", async () => {
    const cause = Object.assign(new Error("EACCES"), { code: "EACCES" });
    readFile.mockRejectedValue(cause);
    await expect(loadTemplates()).rejects.toMatchObject({ cause });
  });

  it("names the file it could not read", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));
    await expect(loadTemplates()).rejects.toThrow(/mutual-nda/);
  });

  /**
   * The build-time guard. A template that has drifted must fail here, while the
   * page is prerendered, rather than reach a user as a half-filled agreement.
   */
  it("refuses to serve a cover page whose placeholders have moved", async () => {
    const real = realTemplates();
    readFile.mockImplementation(async (file: string) =>
      String(file).includes("coverpage")
        ? real.coverPage.replace("[Fill in state]", "[Fill in the state]")
        : real.standardTerms,
    );
    await expect(loadTemplates()).rejects.toThrow(/"Governing Law" matched 0 times/);
  });

  it("refuses to serve a cover page that has lost its signature block", async () => {
    const real = realTemplates();
    readFile.mockImplementation(async (file: string) =>
      String(file).includes("coverpage")
        ? real.coverPage.replace("| Company | | |", "")
        : real.standardTerms,
    );
    await expect(loadTemplates()).rejects.toThrow(/"Company row" matched 0 times/);
  });

  it("accepts a cover page that has only been reworded around its placeholders", async () => {
    const real = realTemplates();
    readFile.mockImplementation(async (file: string) =>
      String(file).includes("coverpage")
        ? real.coverPage.replace("### Purpose", "### Purpose of Disclosure")
        : real.standardTerms,
    );
    await expect(loadTemplates()).resolves.toMatchObject({
      coverPage: expect.stringContaining("### Purpose of Disclosure"),
    });
  });

  it("reads the two files concurrently", async () => {
    let open = 0;
    let peak = 0;
    readFile.mockImplementation(async (file: string) => {
      open += 1;
      peak = Math.max(peak, open);
      await Promise.resolve();
      open -= 1;
      return readFileSync(file, "utf8");
    });
    await loadTemplates();
    expect(peak).toBe(2);
  });
});

describe("the templates on disk", () => {
  it("still carries every placeholder the renderer fills", () => {
    const { coverPage } = realTemplates();
    for (const placeholder of [
      "[Evaluating whether to enter into a business relationship with the other party.]",
      "[Today’s date]",
      "[Fill in state]",
      "List any modifications to the MNDA",
    ]) {
      expect(coverPage, placeholder).toContain(placeholder);
    }
  });

  it("still carries the cross-reference spans the renderer emboldens", () => {
    const { standardTerms } = realTemplates();
    expect(standardTerms).toContain('<span class="coverpage_link">Purpose</span>');
  });

  it("is where lib/templates.ts looks for it", () => {
    // Guards the `process.cwd()/../templates` assumption from the other side:
    // if the directory moves, this fails alongside the loader.
    expect(() => readFileSync(TEMPLATE_FILES.coverPage, "utf8")).not.toThrow();
    expect(() => readFileSync(TEMPLATE_FILES.standardTerms, "utf8")).not.toThrow();
  });
});
