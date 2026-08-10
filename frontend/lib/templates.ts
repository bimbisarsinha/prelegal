/**
 * Server-only access to the Common Paper templates curated in PL-2.
 *
 * The Markdown under `templates/` is the single source of truth for the legal
 * text — it is never copied into this app. Reading happens on the server while
 * the page is prerendered, so the finished text ships in the static HTML and no
 * filesystem access occurs at request time.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultFields } from "./fields";
import { renderAgreement, type Templates } from "./render";

// Next runs with the app directory as cwd, and `templates/` sits beside it at
// the repository root.
const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

const SOURCES = {
  coverPage: "mutual-nda-coverpage.md",
  standardTerms: "mutual-nda.md",
} as const;

async function read(filename: string): Promise<string> {
  const file = path.join(TEMPLATES_DIR, filename);
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    throw new Error(
      `Could not read the MNDA template at ${file}. The frontend reads the ` +
        `agreement text from the repository's templates/ directory.`,
      { cause },
    );
  }
}

export async function loadTemplates(): Promise<Templates> {
  const [coverPage, standardTerms] = await Promise.all([
    read(SOURCES.coverPage),
    read(SOURCES.standardTerms),
  ]);

  const templates = { coverPage, standardTerms };

  // Render once with defaults so a template whose placeholders have moved fails
  // the build here, rather than reaching a user as a half-filled agreement.
  renderAgreement(defaultFields(), templates);

  return templates;
}
