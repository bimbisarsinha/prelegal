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

const DRIFT_ADVICE =
  "The template under templates/ has changed in a way this renderer does not understand.";

export class TemplateAnchorError extends Error {
  constructor(description: string, found: number) {
    super(
      `Template anchor "${description}" matched ${found} times, expected exactly 1. ${DRIFT_ADVICE}`,
    );
    this.name = "TemplateAnchorError";
  }
}

/** Two anchors have grown into each other, so neither one can be trusted. */
export class TemplateOverlapError extends Error {
  constructor(description: string) {
    super(`Template anchor "${description}" overlaps another anchor. ${DRIFT_ADVICE}`);
    this.name = "TemplateOverlapError";
  }
}

interface Substitution {
  /** Matches the template text being replaced, exactly once. */
  pattern: RegExp;
  /** The user's answer, inserted verbatim. */
  replacement: string;
  /** Named in the error when the anchor no longer matches exactly once. */
  description: string;
}

/**
 * Apply every substitution to the template in a single pass.
 *
 * Each anchor is located in the *original* template and never in a partly filled
 * one, which is what keeps user text out of the matching. A sequential pass
 * cannot do this: the Purpose is substituted first, so a purpose reading
 * "a deal governed by [Fill in state] law" would give the Governing Law anchor a
 * second match and throw — taking down a page whose only fault was quoting the
 * form back at it. The same held for modifications naming a signature row.
 *
 * User text is spliced, never used as a `replace` argument, so `$&` and friends
 * in it cannot be read as backreferences.
 */
function substitute(template: string, substitutions: Substitution[]): string {
  const edits = substitutions.map(({ pattern, replacement, description }) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matches = [...template.matchAll(new RegExp(pattern.source, flags))];
    if (matches.length !== 1) {
      throw new TemplateAnchorError(description, matches.length);
    }
    const [match] = matches;
    return { start: match.index, end: match.index + match[0].length, replacement, description };
  });

  edits.sort((left, right) => left.start - right.start);

  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) {
      throw new TemplateOverlapError(edit.description);
    }
    out += template.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  return out + template.slice(cursor);
}

function checkbox(selected: boolean): string {
  return selected ? "- [x]" : "- [ ]";
}

function fillCoverPage(template: string, fields: NdaFields): string {
  const byYears = fields.mndaTerm === "years";
  const confByYears = fields.confidentialityTerm === "years";

  return substitute(template, [
    {
      description: "Purpose",
      pattern: /\[Evaluating whether to enter into a business relationship with the other party\.\]/,
      replacement: orBlank(fields.purpose),
    },
    {
      description: "Effective Date",
      pattern: /\[Today[^\]]*date\]/,
      replacement: formatDate(fields.effectiveDate) || BLANK,
    },
    {
      description: "MNDA Term (fixed years)",
      pattern: /^- \[[ x]\] +Expires \[[^\]]*\] from Effective Date\.$/m,
      replacement: `${checkbox(byYears)}     Expires ${
        byYears ? formatYears(fields.mndaTermYears) : BLANK
      } from Effective Date.`,
    },
    {
      description: "MNDA Term (until terminated)",
      pattern: /^- \[[ x]\] +Continues until terminated.*$/m,
      replacement: `${checkbox(
        !byYears,
      )}     Continues until terminated in accordance with the terms of the MNDA.`,
    },
    {
      description: "Term of Confidentiality (fixed years)",
      pattern: /^- \[[ x]\] +\[[^\]]*\] from Effective Date, but in the case of trade secrets.*$/m,
      replacement:
        `${checkbox(confByYears)}     ${
          confByYears ? formatYears(fields.confidentialityYears) : BLANK
        } from Effective Date, but in the case of trade secrets until Confidential Information ` +
        `is no longer considered a trade secret under applicable laws.`,
    },
    {
      description: "Term of Confidentiality (perpetual)",
      pattern: /^- \[[ x]\] +In perpetuity\.$/m,
      replacement: `${checkbox(!confByYears)}     In perpetuity.`,
    },
    {
      description: "Governing Law",
      pattern: /\[Fill in state\]/,
      replacement: orBlank(fields.governingLaw),
    },
    {
      description: "Jurisdiction",
      pattern: /\[Fill in city or county and state[^\]]*\]/,
      replacement: orBlank(fields.jurisdiction),
    },
    {
      description: "MNDA Modifications",
      pattern: /^List any modifications to the MNDA$/m,
      replacement: fields.modifications.trim() || "None.",
    },
    ...partyTableSubstitutions(fields.party1, fields.party2),
  ]);
}

/**
 * Fit a party's answer into one table cell.
 *
 * A Markdown table row is a single line, and `|` ends a cell. Party details come
 * from free-text inputs — a postal address is naturally typed over several lines,
 * and a company name may legitimately contain a pipe — so newlines are folded
 * into the line and pipes are escaped. Left alone, a pasted address splits the
 * row in two and a stray pipe shifts every cell after it one column right.
 *
 * Backslashes are escaped before pipes, and in that order. `A\|B` must reach the
 * file as `A\\\|B` — an escaped backslash then an escaped pipe. Escaping only the
 * pipe would emit `A\\|B`, which every other Markdown reader takes as an escaped
 * backslash followed by a live cell delimiter, so the downloaded file would shift
 * its columns while the preview did not.
 */
function tableCell(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

/**
 * The signature block.
 *
 * Signature and Date rows are absent — they are signed by hand. The upstream
 * template's `| Print Name | |` row is short a cell; rewriting whole rows repairs
 * that on the way out.
 */
function partyTableSubstitutions(party1: Party, party2: Party): Substitution[] {
  const row = (label: string, value: (party: Party) => string) =>
    `| ${label} | ${orBlank(tableCell(value(party1)))} | ${orBlank(tableCell(value(party2)))} |`;

  return [
    {
      description: "Print Name row",
      pattern: /^\| Print Name \|.*$/m,
      replacement: row("Print Name", (p) => p.printName),
    },
    {
      description: "Title row",
      pattern: /^\| Title \|.*$/m,
      // Title is optional: not every signatory has one, and the template does not
      // insist. An empty cell is preferable to a blank line implying an omission.
      replacement: `| Title | ${tableCell(party1.title)} | ${tableCell(party2.title)} |`,
    },
    {
      description: "Company row",
      pattern: /^\| Company \|.*$/m,
      replacement: row("Company", (p) => p.company),
    },
    {
      description: "Notice Address row",
      pattern: /^\| Notice Address(<label>.*?<\/label>| )*\|.*$/m,
      replacement:
        `| Notice Address <label>Use either email or postal address</label> ` +
        `| ${orBlank(tableCell(party1.noticeAddress))} ` +
        `| ${orBlank(tableCell(party2.noticeAddress))} |`,
    },
  ];
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
