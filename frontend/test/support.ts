/**
 * Fixtures shared across the suite.
 *
 * The templates are read from the repository's `templates/` directory rather
 * than copied here. Tests that assert against a snapshot of the legal text
 * would pass while the real agreement drifted, which is the one failure this
 * app is built to prevent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { defaultFields, type NdaFields, type Party } from "@/lib/fields";
import type { Templates } from "@/lib/render";

/** Resolved from this file, so it holds wherever the runner was invoked from. */
const TEMPLATES_DIR = path.join(import.meta.dirname, "..", "..", "templates");

export const TEMPLATE_FILES = {
  coverPage: path.join(TEMPLATES_DIR, "mutual-nda-coverpage.md"),
  standardTerms: path.join(TEMPLATES_DIR, "mutual-nda.md"),
} as const;

export function realTemplates(): Templates {
  return {
    coverPage: readFileSync(TEMPLATE_FILES.coverPage, "utf8"),
    standardTerms: readFileSync(TEMPLATE_FILES.standardTerms, "utf8"),
  };
}

export const PARTY_1: Party = {
  printName: "Dana Reyes",
  title: "Chief Executive Officer",
  company: "Acme, Inc.",
  noticeAddress: "legal@acme.example",
};

/** Deliberately without a title — it is the one optional party field. */
export const PARTY_2: Party = {
  printName: "Sam Okafor",
  title: "",
  company: "Globex LLC",
  noticeAddress: "legal@globex.example",
};

/** A field set that `validate` returns no errors for. */
export function completeFields(overrides: Partial<NdaFields> = {}): NdaFields {
  return {
    ...defaultFields(),
    effectiveDate: "2026-08-12",
    mndaTermYears: "3",
    confidentialityYears: "5",
    governingLaw: "Delaware",
    jurisdiction: "courts located in New Castle, DE",
    party1: { ...PARTY_1 },
    party2: { ...PARTY_2 },
    ...overrides,
  };
}

/**
 * Line endings in `templates/` are a checkout artifact — git hands out CRLF on
 * Windows and LF elsewhere — so no assertion should depend on them.
 */
export const normalizeNewlines = (text: string) => text.replace(/\r\n/g, "\n");

/** The two halves of a rendered agreement, split on the page break. */
export function splitAgreement(document: string): { coverPage: string; standardTerms: string } {
  const parts = normalizeNewlines(document).split("\n\n---\n\n");
  if (parts.length !== 2) {
    throw new Error(`Expected one page break in the rendered agreement, found ${parts.length - 1}`);
  }
  return { coverPage: parts[0], standardTerms: parts[1] };
}
