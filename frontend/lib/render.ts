/**
 * Turns the Common Paper templates plus a user's answers into one finished
 * Markdown document. Pure — the same inputs always produce the same string,
 * which is what lets the on-screen preview and the downloaded file be the
 * literal same text.
 *
 * Two rules govern the transforms below:
 *
 * 1. Cover Page placeholders get replaced. `[Fill in state]` is a blank the
 *    user fills, so it disappears along with its brackets.
 * 2. Standard Terms `coverpage_link` spans do NOT get replaced. They are
 *    cross-references to the Cover Page, not placeholders — clause 2 reads
 *    "solely for the Purpose", and substituting the purpose text there would
 *    produce "solely for the Evaluating whether to...". They render as bold
 *    defined terms instead.
 *
 * Every Cover Page anchor is asserted to match exactly once. The templates are
 * upstream files that may be re-synced, so a moved or reworded placeholder must
 * break the build loudly rather than silently emit an agreement with a stray
 * `[Fill in state]` — or worse, a missing term — in it.
 */

import {
  BLANK,
  formatDate,
  formatYears,
  orBlank,
  type NdaFields,
  type Party,
} from "./fields";

export class TemplateAnchorError extends Error {
  constructor(description: string, found: number) {
    super(
      `Template anchor "${description}" matched ${found} times, expected exactly 1. ` +
        `The template under templates/ has changed in a way this renderer does not understand.`,
    );
    this.name = "TemplateAnchorError";
  }
}

function replaceOnce(
  text: string,
  pattern: RegExp,
  replacement: string,
  description: string,
): string {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = text.match(new RegExp(pattern.source, flags));
  if (matches?.length !== 1) {
    throw new TemplateAnchorError(description, matches?.length ?? 0);
  }
  // `replacement` is user text; `$` sequences in it must not be read as
  // backreferences, so the function form is used rather than the string form.
  return text.replace(pattern, () => replacement);
}

function checkbox(selected: boolean): string {
  return selected ? "- [x]" : "- [ ]";
}

function fillCoverPage(template: string, fields: NdaFields): string {
  let out = template;

  out = replaceOnce(
    out,
    /\[Evaluating whether to enter into a business relationship with the other party\.\]/,
    orBlank(fields.purpose),
    "Purpose",
  );

  out = replaceOnce(
    out,
    /\[Today[^\]]*date\]/,
    formatDate(fields.effectiveDate) || BLANK,
    "Effective Date",
  );

  const byYears = fields.mndaTerm === "years";
  out = replaceOnce(
    out,
    /^- \[[ x]\] +Expires \[[^\]]*\] from Effective Date\.$/m,
    `${checkbox(byYears)}     Expires ${
      byYears ? formatYears(fields.mndaTermYears) : BLANK
    } from Effective Date.`,
    "MNDA Term (fixed years)",
  );
  out = replaceOnce(
    out,
    /^- \[[ x]\] +Continues until terminated.*$/m,
    `${checkbox(
      !byYears,
    )}     Continues until terminated in accordance with the terms of the MNDA.`,
    "MNDA Term (until terminated)",
  );

  const confByYears = fields.confidentialityTerm === "years";
  out = replaceOnce(
    out,
    /^- \[[ x]\] +\[[^\]]*\] from Effective Date, but in the case of trade secrets.*$/m,
    `${checkbox(confByYears)}     ${
      confByYears ? formatYears(fields.confidentialityYears) : BLANK
    } from Effective Date, but in the case of trade secrets until Confidential Information ` +
      `is no longer considered a trade secret under applicable laws.`,
    "Term of Confidentiality (fixed years)",
  );
  out = replaceOnce(
    out,
    /^- \[[ x]\] +In perpetuity\.$/m,
    `${checkbox(!confByYears)}     In perpetuity.`,
    "Term of Confidentiality (perpetual)",
  );

  out = replaceOnce(out, /\[Fill in state\]/, orBlank(fields.governingLaw), "Governing Law");
  out = replaceOnce(
    out,
    /\[Fill in city or county and state[^\]]*\]/,
    orBlank(fields.jurisdiction),
    "Jurisdiction",
  );

  out = replaceOnce(
    out,
    /^List any modifications to the MNDA$/m,
    fields.modifications.trim() || "None.",
    "MNDA Modifications",
  );

  return fillPartyTable(out, fields.party1, fields.party2);
}

/**
 * Fill the signature block.
 *
 * Signature and Date rows are left untouched — they are signed by hand. The
 * upstream template's `| Print Name | |` row is short a cell; rewriting whole
 * rows repairs that on the way out.
 */
function fillPartyTable(template: string, party1: Party, party2: Party): string {
  const row = (label: string, value: (party: Party) => string) =>
    `| ${label} | ${orBlank(value(party1))} | ${orBlank(value(party2))} |`;

  let out = replaceOnce(
    template,
    /^\| Print Name \|.*$/m,
    row("Print Name", (p) => p.printName),
    "Print Name row",
  );
  out = replaceOnce(
    out,
    /^\| Title \|.*$/m,
    // Title is optional: not every signatory has one, and the template does not
    // insist. An empty cell is preferable to a blank line implying an omission.
    `| Title | ${party1.title.trim()} | ${party2.title.trim()} |`,
    "Title row",
  );
  out = replaceOnce(
    out,
    /^\| Company \|.*$/m,
    row("Company", (p) => p.company),
    "Company row",
  );
  out = replaceOnce(
    out,
    /^\| Notice Address(<label>.*?<\/label>| )*\|.*$/m,
    `| Notice Address <label>Use either email or postal address</label> | ${orBlank(
      party1.noticeAddress,
    )} | ${orBlank(party2.noticeAddress)} |`,
    "Notice Address row",
  );

  return out;
}

/**
 * Present `<span class="coverpage_link">Purpose</span>` as a bold defined term.
 * These mark values that live on the Cover Page; the reader needs to see that
 * they are defined elsewhere, not have them spliced in mid-sentence.
 */
function fillStandardTerms(template: string): string {
  return template.replace(
    /<span class="coverpage_link">(.*?)<\/span>/g,
    (_match, term: string) => `**${term}**`,
  );
}

export interface Templates {
  coverPage: string;
  standardTerms: string;
}

/** The complete agreement: filled Cover Page, then the Standard Terms. */
export function renderAgreement(fields: NdaFields, templates: Templates): string {
  return [
    fillCoverPage(templates.coverPage, fields),
    "---",
    fillStandardTerms(templates.standardTerms),
  ].join("\n\n");
}

/** `mutual-nda-acme-globex.md`, falling back to a plain name. */
export function documentFilename(fields: NdaFields, extension: string): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const parties = [slug(fields.party1.company), slug(fields.party2.company)].filter(Boolean);
  return ["mutual-nda", ...parties].join("-") + extension;
}
