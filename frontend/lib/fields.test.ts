import { describe, expect, it } from "vitest";
import {
  BLANK,
  DEFAULT_PURPOSE,
  defaultFields,
  formatDate,
  formatYears,
  orBlank,
  validate,
} from "./fields";
import { completeFields } from "@/test/support";

describe("formatDate", () => {
  it("formats an ISO date as a long date", () => {
    expect(formatDate("2026-08-12")).toBe("August 12, 2026");
  });

  it("drops the leading zero from the day", () => {
    expect(formatDate("2026-08-01")).toBe("August 1, 2026");
  });

  it("names every month", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatDate(`2026-${String(index + 1).padStart(2, "0")}-15`),
    );
    expect(months).toEqual([
      "January 15, 2026",
      "February 15, 2026",
      "March 15, 2026",
      "April 15, 2026",
      "May 15, 2026",
      "June 15, 2026",
      "July 15, 2026",
      "August 15, 2026",
      "September 15, 2026",
      "October 15, 2026",
      "November 15, 2026",
      "December 15, 2026",
    ]);
  });

  /**
   * The guard against parsing through `Date`: UTC midnight lands on the previous
   * day for anyone west of Greenwich, which would make the server render and the
   * browser render disagree. The day in must be the day out, in any zone.
   */
  it("keeps the day it was given regardless of the host time zone", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = zone;
        expect(formatDate("2026-01-01"), zone).toBe("January 1, 2026");
        expect(formatDate("2026-12-31"), zone).toBe("December 31, 2026");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it.each([
    ["empty", ""],
    ["unpadded", "2026-8-1"],
    ["prose", "next Tuesday"],
    ["month 13", "2026-13-01"],
    ["month 00", "2026-00-01"],
    ["two-digit year", "26-08-12"],
    ["trailing time", "2026-08-12T00:00:00Z"],
  ])("returns nothing for %s input", (_label, value) => {
    expect(formatDate(value)).toBe("");
  });
});

describe("formatYears", () => {
  it("uses the singular for one year", () => {
    expect(formatYears("1")).toBe("1 year");
  });

  it("uses the plural beyond one year", () => {
    expect(formatYears("3")).toBe("3 years");
  });

  it.each(["0", "-1", "1.5", "", "abc", " "])("blanks an unusable count: %j", (value) => {
    expect(formatYears(value)).toBe(BLANK);
  });
});

describe("orBlank", () => {
  it("returns the trimmed value", () => {
    expect(orBlank("  Acme, Inc.  ")).toBe("Acme, Inc.");
  });

  it.each(["", "   ", "\n\t"])("blanks whitespace-only input: %j", (value) => {
    expect(orBlank(value)).toBe(BLANK);
  });
});

describe("defaultFields", () => {
  it("suggests the purpose carried by the template", () => {
    expect(defaultFields().purpose).toBe(DEFAULT_PURPOSE);
  });

  it("returns a fresh object each time, so one form cannot mutate another's defaults", () => {
    const first = defaultFields();
    first.party1.company = "Acme, Inc.";
    expect(defaultFields().party1.company).toBe("");
  });
});

describe("validate", () => {
  const fieldsWithErrors = (fields = defaultFields()) => validate(fields).map((e) => e.field);

  it("passes a complete field set", () => {
    expect(validate(completeFields())).toEqual([]);
  });

  it("reports every unfilled requirement on a fresh form", () => {
    // The defaults carry a purpose and both year counts, so only the blanks fail.
    expect(fieldsWithErrors()).toEqual([
      "effectiveDate",
      "governingLaw",
      "jurisdiction",
      "party1.printName",
      "party1.company",
      "party1.noticeAddress",
      "party2.printName",
      "party2.company",
      "party2.noticeAddress",
    ]);
  });

  it.each([
    ["purpose", { purpose: "   " }],
    ["effectiveDate", { effectiveDate: "not-a-date" }],
    ["governingLaw", { governingLaw: " " }],
    ["jurisdiction", { jurisdiction: "" }],
  ])("requires %s", (field, patch) => {
    expect(fieldsWithErrors(completeFields(patch))).toEqual([field]);
  });

  it.each([
    ["party1.printName", { party1: { ...completeFields().party1, printName: " " } }],
    ["party1.company", { party1: { ...completeFields().party1, company: "" } }],
    ["party1.noticeAddress", { party1: { ...completeFields().party1, noticeAddress: "" } }],
    ["party2.printName", { party2: { ...completeFields().party2, printName: "" } }],
    ["party2.company", { party2: { ...completeFields().party2, company: "" } }],
    ["party2.noticeAddress", { party2: { ...completeFields().party2, noticeAddress: " " } }],
  ])("requires %s", (field, patch) => {
    expect(fieldsWithErrors(completeFields(patch))).toEqual([field]);
  });

  it("treats a missing title as acceptable for both parties", () => {
    const fields = completeFields();
    fields.party1.title = "";
    fields.party2.title = "";
    expect(validate(fields)).toEqual([]);
  });

  it.each(["0", "-2", "2.5", "", "soon"])("rejects an MNDA term of %j years", (value) => {
    expect(fieldsWithErrors(completeFields({ mndaTermYears: value }))).toEqual(["mndaTermYears"]);
  });

  it.each(["0", "-2", "2.5", "", "soon"])(
    "rejects a confidentiality term of %j years",
    (value) => {
      expect(fieldsWithErrors(completeFields({ confidentialityYears: value }))).toEqual([
        "confidentialityYears",
      ]);
    },
  );

  it("ignores the MNDA year count when the term runs until terminated", () => {
    const fields = completeFields({ mndaTerm: "untilTerminated", mndaTermYears: "nonsense" });
    expect(validate(fields)).toEqual([]);
  });

  it("ignores the confidentiality year count when it is perpetual", () => {
    const fields = completeFields({
      confidentialityTerm: "perpetual",
      confidentialityYears: "nonsense",
    });
    expect(validate(fields)).toEqual([]);
  });

  it("names the field it is complaining about in every message", () => {
    for (const error of validate(defaultFields())) {
      expect(error.message, error.field).toMatch(/\S/);
      expect(error.message, error.field).toMatch(/\.$/);
    }
  });

  /** The error summary keys its list items by field, so a repeat would collide. */
  it("reports each field at most once", () => {
    const fields = validate(defaultFields()).map((error) => error.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("does not mutate the fields it is given", () => {
    const fields = defaultFields();
    const before = structuredClone(fields);
    validate(fields);
    expect(fields).toEqual(before);
  });
});
