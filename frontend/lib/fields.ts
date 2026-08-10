/**
 * The information a user supplies to complete a Mutual NDA Cover Page.
 *
 * The field set mirrors the fill-in blanks of `templates/mutual-nda-coverpage.md`.
 * Signature and Date are deliberately absent: the template leaves them blank so
 * the parties can sign the finished document.
 */

export interface Party {
  printName: string;
  title: string;
  company: string;
  noticeAddress: string;
}

/** How long the MNDA itself lasts. */
export type MndaTerm = "years" | "untilTerminated";

/** How long confidentiality obligations survive. */
export type ConfidentialityTerm = "years" | "perpetual";

export interface NdaFields {
  purpose: string;
  /** ISO `yyyy-mm-dd`, as produced by `<input type="date">`. */
  effectiveDate: string;
  mndaTerm: MndaTerm;
  mndaTermYears: string;
  confidentialityTerm: ConfidentialityTerm;
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
}

/** The suggested purpose carried by the Common Paper template. */
export const DEFAULT_PURPOSE =
  "Evaluating whether to enter into a business relationship with the other party.";

/** Stand-in shown in the preview for a required field the user has not filled yet. */
export const BLANK = "________";

const emptyParty = (): Party => ({
  printName: "",
  title: "",
  company: "",
  noticeAddress: "",
});

export const defaultFields = (): NdaFields => ({
  purpose: DEFAULT_PURPOSE,
  effectiveDate: "",
  mndaTerm: "years",
  mndaTermYears: "1",
  confidentialityTerm: "years",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  party1: emptyParty(),
  party2: emptyParty(),
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Format an ISO date as `August 12, 2026`.
 *
 * Deliberately built from the string's own parts rather than `Date`: the value
 * is rendered on the server and again in the browser, and parsing `yyyy-mm-dd`
 * through `Date` resolves to UTC midnight, which shifts the day backwards for
 * anyone west of Greenwich and desynchronises the two renders.
 */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return "";
  return `${name} ${Number(day)}, ${year}`;
}

/** `3` -> `3 years`, `1` -> `1 year`. Returns a blank when the count is unusable. */
export function formatYears(value: string): string {
  const years = Number(value);
  if (!Number.isInteger(years) || years < 1) return BLANK;
  return `${years} ${years === 1 ? "year" : "years"}`;
}

/** The user's text, or a blank line to sign over if they have not filled it in. */
export function orBlank(value: string): string {
  return value.trim() || BLANK;
}

export interface FieldError {
  /** Dotted path, e.g. `party1.company`. Matches the form input `name`. */
  field: string;
  message: string;
}

function validateYears(
  value: string,
  field: string,
  label: string,
  errors: FieldError[],
): void {
  const years = Number(value);
  if (!Number.isInteger(years) || years < 1) {
    errors.push({ field, message: `${label} must be a whole number of years, at least 1.` });
  }
}

function validateParty(party: Party, key: "party1" | "party2", label: string): FieldError[] {
  const errors: FieldError[] = [];
  if (!party.printName.trim()) {
    errors.push({ field: `${key}.printName`, message: `${label}: signatory name is required.` });
  }
  if (!party.company.trim()) {
    errors.push({ field: `${key}.company`, message: `${label}: company is required.` });
  }
  // Clause 11 delivers notices to the addresses on the Cover Page, so an
  // agreement without them has no working notice mechanism.
  if (!party.noticeAddress.trim()) {
    errors.push({
      field: `${key}.noticeAddress`,
      message: `${label}: notice address is required.`,
    });
  }
  return errors;
}

/** Everything that must be filled in before the document is fit to download. */
export function validate(fields: NdaFields): FieldError[] {
  const errors: FieldError[] = [];

  if (!fields.purpose.trim()) {
    errors.push({ field: "purpose", message: "Purpose is required." });
  }
  if (!formatDate(fields.effectiveDate)) {
    errors.push({ field: "effectiveDate", message: "Effective date is required." });
  }
  if (fields.mndaTerm === "years") {
    validateYears(fields.mndaTermYears, "mndaTermYears", "MNDA term", errors);
  }
  if (fields.confidentialityTerm === "years") {
    validateYears(
      fields.confidentialityYears,
      "confidentialityYears",
      "Term of confidentiality",
      errors,
    );
  }
  if (!fields.governingLaw.trim()) {
    errors.push({ field: "governingLaw", message: "Governing law is required." });
  }
  if (!fields.jurisdiction.trim()) {
    errors.push({ field: "jurisdiction", message: "Jurisdiction is required." });
  }

  errors.push(...validateParty(fields.party1, "party1", "Party 1"));
  errors.push(...validateParty(fields.party2, "party2", "Party 2"));

  return errors;
}
