import { describe, expect, it } from "vitest";
import { BLANK, DEFAULT_PURPOSE, defaultFields } from "./fields";
import {
  TemplateAnchorError,
  TemplateOverlapError,
  documentFilename,
  renderAgreement,
} from "./render";
import {
  PARTY_1,
  completeFields,
  normalizeNewlines,
  realTemplates,
  splitAgreement,
} from "@/test/support";

const templates = realTemplates();
const render = (fields = completeFields()) => renderAgreement(fields, templates);

describe("renderAgreement", () => {
  it("is pure: the same fields render the same document", () => {
    expect(render()).toBe(render());
  });

  it("does not mutate the templates it is given", () => {
    const before = { ...templates };
    render();
    expect(templates).toEqual(before);
  });

  it("joins the filled cover page to the standard terms with a page break", () => {
    const { coverPage, standardTerms } = splitAgreement(render());
    expect(coverPage).toContain("# Mutual Non-Disclosure Agreement");
    expect(standardTerms).toContain("# Standard Terms");
  });

  describe("cover page", () => {
    it("leaves no unfilled placeholder behind", () => {
      const { coverPage } = splitAgreement(render());
      expect(coverPage).not.toContain("[Fill in");
      expect(coverPage).not.toContain("[Today");
      expect(coverPage).not.toContain("[Evaluating whether");
      expect(coverPage).not.toContain("[1 year(s)]");
      expect(coverPage).not.toContain("List any modifications to the MNDA");
    });

    it("carries every answer the user gave", () => {
      const fields = completeFields({
        purpose: "Evaluating a joint bid for the Northwind tender.",
        modifications: "Section 5 is amended to require 30 days' notice.",
      });
      const { coverPage } = splitAgreement(render(fields));

      expect(coverPage).toContain("Evaluating a joint bid for the Northwind tender.");
      expect(coverPage).toContain("August 12, 2026");
      expect(coverPage).toContain("3 years");
      expect(coverPage).toContain("Delaware");
      expect(coverPage).toContain("courts located in New Castle, DE");
      expect(coverPage).toContain("Section 5 is amended to require 30 days' notice.");
    });

    it("substitutes a blank for each required answer still missing", () => {
      const { coverPage } = splitAgreement(render(defaultFields()));
      // Effective Date, Governing Law, Jurisdiction, and two cells each for
      // Print Name, Company and Notice Address. Title is optional, so it stays
      // empty rather than becoming a line to sign over.
      expect(coverPage.match(new RegExp(BLANK, "g"))).toHaveLength(9);
    });

    it("records 'None.' when there are no modifications", () => {
      const { coverPage } = splitAgreement(render(completeFields({ modifications: "  " })));
      expect(coverPage).toContain("### MNDA Modifications\nNone.");
    });

    it("trims surrounding whitespace from modifications", () => {
      const fields = completeFields({ modifications: "\n  No changes to clause 8.  \n" });
      expect(splitAgreement(render(fields)).coverPage).toContain(
        "### MNDA Modifications\nNo changes to clause 8.",
      );
    });
  });

  describe("term checkboxes", () => {
    it("ticks a fixed MNDA term and states the years", () => {
      const { coverPage } = splitAgreement(render(completeFields({ mndaTermYears: "2" })));
      expect(coverPage).toContain("- [x]     Expires 2 years from Effective Date.");
      expect(coverPage).toContain(
        "- [ ]     Continues until terminated in accordance with the terms of the MNDA.",
      );
    });

    it("ticks the open-ended MNDA term and blanks the unused year count", () => {
      const fields = completeFields({ mndaTerm: "untilTerminated", mndaTermYears: "3" });
      const { coverPage } = splitAgreement(render(fields));
      expect(coverPage).toContain(`- [ ]     Expires ${BLANK} from Effective Date.`);
      expect(coverPage).toContain(
        "- [x]     Continues until terminated in accordance with the terms of the MNDA.",
      );
      // The abandoned answer must not survive in the unticked option.
      expect(coverPage).not.toContain("Expires 3 years");
    });

    it("ticks a fixed confidentiality term, keeping the trade secret carve-out", () => {
      const { coverPage } = splitAgreement(render(completeFields({ confidentialityYears: "5" })));
      expect(coverPage).toContain(
        "- [x]     5 years from Effective Date, but in the case of trade secrets until " +
          "Confidential Information is no longer considered a trade secret under applicable laws.",
      );
      expect(coverPage).toContain("- [ ]     In perpetuity.");
    });

    it("ticks perpetual confidentiality and blanks the unused year count", () => {
      const fields = completeFields({ confidentialityTerm: "perpetual", confidentialityYears: "5" });
      const { coverPage } = splitAgreement(render(fields));
      expect(coverPage).toContain(`- [ ]     ${BLANK} from Effective Date`);
      expect(coverPage).toContain("- [x]     In perpetuity.");
      expect(coverPage).not.toContain("5 years from Effective Date");
    });

    it("ticks exactly one option in each pair", () => {
      for (const fields of [
        completeFields(),
        completeFields({ mndaTerm: "untilTerminated" }),
        completeFields({ confidentialityTerm: "perpetual" }),
        completeFields({ mndaTerm: "untilTerminated", confidentialityTerm: "perpetual" }),
      ]) {
        const { coverPage } = splitAgreement(render(fields));
        expect(coverPage.match(/^- \[x\]/gm)).toHaveLength(2);
        expect(coverPage.match(/^- \[ \]/gm)).toHaveLength(2);
      }
    });
  });

  describe("signature block", () => {
    const partyTable = (document: string) =>
      splitAgreement(document)
        .coverPage.split("\n")
        .filter((line) => line.startsWith("|"));

    it("gives every rewritten row three cells, repairing the short upstream row", () => {
      for (const line of partyTable(render())) {
        expect(line.split("|").slice(1, -1), line).toHaveLength(3);
      }
    });

    it("fills both parties into each row", () => {
      const rows = partyTable(render());
      expect(rows).toContain("| Print Name | Dana Reyes | Sam Okafor |");
      expect(rows).toContain("| Company | Acme, Inc. | Globex LLC |");
      expect(rows).toContain(
        "| Notice Address <label>Use either email or postal address</label> " +
          "| legal@acme.example | legal@globex.example |",
      );
    });

    it("leaves an optional title empty rather than blanking it for signature", () => {
      expect(partyTable(render())).toContain("| Title | Chief Executive Officer |  |");
    });

    it("leaves Signature and Date for the parties to complete by hand", () => {
      const rows = partyTable(render());
      expect(rows).toContain("| Signature | | |");
      expect(rows).toContain("| Date | | |");
    });

    /**
     * A table row is one line and `|` ends a cell, but the notice address is a
     * textarea inviting a postal address. Left alone, the row splits in two and
     * the parser abandons the table halfway through the signature block.
     */
    it("folds a multi-line notice address into its cell", () => {
      const fields = completeFields({
        party1: { ...PARTY_1, noticeAddress: "123 Main St\nSuite 400\nSpringfield, IL 62704" },
      });
      const rows = partyTable(render(fields));
      expect(rows).toContain(
        "| Notice Address <label>Use either email or postal address</label> " +
          "| 123 Main St, Suite 400, Springfield, IL 62704 | legal@globex.example |",
      );
    });

    it("keeps the whole signature block on one row each", () => {
      const fields = completeFields({
        party1: { ...PARTY_1, noticeAddress: "123 Main St\n\nSpringfield, IL\n" },
      });
      // Seven rows: header, separator, Signature, Print Name, Title, Company,
      // Notice Address, Date. A split row would push the count past that.
      expect(partyTable(render(fields))).toHaveLength(8);
    });

    /**
     * A backslash must be escaped before the pipe, and in that order. `A\|B` has
     * to reach the file as `A\\\|B`; emitting `A\\|B` would leave every other
     * Markdown reader with an escaped backslash and a live delimiter, shifting the
     * columns in the downloaded file while the preview looked correct.
     */
    it("escapes a backslash so it cannot escape the delimiter after it", () => {
      const fields = completeFields({
        party1: { ...PARTY_1, company: "A\\|B" },
      });
      const row = partyTable(render(fields)).find((line) => line.startsWith("| Company")) ?? "";
      expect(row).toBe("| Company | A\\\\\\|B | Globex LLC |");
    });

    it("escapes a trailing backslash", () => {
      const fields = completeFields({ party1: { ...PARTY_1, company: "Acme\\" } });
      const row = partyTable(render(fields)).find((line) => line.startsWith("| Company")) ?? "";
      expect(row).toBe("| Company | Acme\\\\ | Globex LLC |");
    });

    it("escapes a pipe rather than letting it shift the columns", () => {
      const fields = completeFields({
        party1: { ...PARTY_1, company: "Acme | Globex Holdings" },
      });
      const rows = partyTable(render(fields));
      expect(rows).toContain("| Company | Acme \\| Globex Holdings | Globex LLC |");
      for (const line of rows) {
        expect(line.split(/(?<!\\)\|/).slice(1, -1), line).toHaveLength(3);
      }
    });

    it("blanks a party cell the user has not filled in", () => {
      const fields = completeFields({
        party2: { printName: "", title: "", company: "", noticeAddress: "" },
      });
      const rows = partyTable(render(fields));
      expect(rows).toContain(`| Print Name | Dana Reyes | ${BLANK} |`);
      expect(rows).toContain(`| Company | Acme, Inc. | ${BLANK} |`);
    });
  });

  describe("standard terms", () => {
    it("presents cover page cross-references as bold defined terms", () => {
      const { standardTerms } = splitAgreement(render());
      expect(standardTerms).toContain("solely for the **Purpose**");
      expect(standardTerms).toContain("commences on the **Effective Date**");
      expect(standardTerms).toContain("expires at the end of the **MNDA Term**");
      expect(standardTerms).toContain("survive for the **Term of Confidentiality**");
      expect(standardTerms).toContain("laws of the State of **Governing Law**");
      expect(standardTerms).toContain("courts located in **Jurisdiction**");
    });

    it("converts every span, leaving no markup in the document", () => {
      expect(splitAgreement(render()).standardTerms).not.toContain("<span");
      expect(splitAgreement(render()).standardTerms).not.toContain("coverpage_link");
    });

    /**
     * The decision this whole renderer turns on: clause 2 reads "solely for the
     * Purpose". Splicing the value in would produce "solely for the Evaluating
     * whether to enter into a business relationship...".
     */
    it("never splices a cover page value into the standard terms", () => {
      const fields = completeFields({ purpose: "Evaluating a joint bid." });
      const { standardTerms } = splitAgreement(render(fields));
      expect(standardTerms).not.toContain("Evaluating a joint bid.");
      expect(standardTerms).not.toContain("Delaware");
      expect(standardTerms).not.toContain("Acme, Inc.");
      expect(standardTerms).not.toContain("August 12, 2026");
    });

    it("leaves the legal text otherwise untouched", () => {
      const { standardTerms } = splitAgreement(render());
      const expected = normalizeNewlines(templates.standardTerms).replace(
        /<span class="coverpage_link">(.*?)<\/span>/g,
        "**$1**",
      );
      expect(standardTerms).toBe(expected);
    });

    it("keeps the Common Paper attribution the licence requires", () => {
      expect(render()).toContain(
        "free to use under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)",
      );
    });
  });

  describe("user text is inserted literally", () => {
    /**
     * `String.prototype.replace` reads `$&`, `$'` and `` $` `` in a replacement
     * string as backreferences. Contract text is full of dollar signs.
     */
    it("does not read $ sequences in user input as backreferences", () => {
      const purpose = "Evaluating a $1,000,000 deal: $& and $` and $' and $$ and $<x>.";
      const { coverPage } = splitAgreement(render(completeFields({ purpose })));
      expect(coverPage).toContain(purpose);
    });

    it.each([
      ["governing law", { governingLaw: "$&" }, "$&"],
      ["jurisdiction", { jurisdiction: "courts in $`" }, "courts in $`"],
      ["modifications", { modifications: "Fee is $500 (see $&)" }, "Fee is $500 (see $&)"],
    ] as const)("inserts %s verbatim", (_label, patch, value) => {
      expect(splitAgreement(render(completeFields(patch))).coverPage).toContain(value);
    });

    it("inserts party names containing $ verbatim", () => {
      const fields = completeFields({
        party1: { printName: "A$B", title: "$&", company: "$`Co", noticeAddress: "a$b@x.example" },
      });
      const { coverPage } = splitAgreement(render(fields));
      expect(coverPage).toContain("| Print Name | A$B |");
      expect(coverPage).toContain("| Title | $& |");
      expect(coverPage).toContain("| Company | $`Co |");
    });

    /**
     * Anchors are matched against the pristine template, so an answer that quotes
     * the form back at it is just text. When the passes were sequential, a purpose
     * mentioning `[Fill in state]` gave the Governing Law anchor a second match
     * and threw during render — blanking the page and losing everything typed.
     */
    it.each([
      ["purpose", { purpose: "Evaluating a deal governed by [Fill in state] law." }],
      ["purpose", { purpose: "Sharing our [Today’s date] roadmap." }],
      ["purpose", { purpose: "Evaluating a bid. List any modifications to the MNDA" }],
      ["modifications", { modifications: "| Title | see the side letter | as above |" }],
      ["modifications", { modifications: "| Company | Acme | Globex |" }],
      ["modifications", { modifications: "Replaces: [Fill in city or county and state]" }],
      ["modifications", { modifications: "- [x]     In perpetuity." }],
      ["modifications", { modifications: "| Print Name | | |" }],
      [
        "modifications",
        { modifications: "| Notice Address <label>Use either email or postal address</label> | | |" },
      ],
    ])("accepts %s text that quotes the template's own anchors", (_field, patch) => {
      expect(() => render(completeFields(patch))).not.toThrow();
    });

    it("still fills every other field when one answer quotes an anchor", () => {
      const fields = completeFields({ purpose: "A deal governed by [Fill in state] law." });
      const { coverPage } = splitAgreement(render(fields));
      expect(coverPage).toContain("A deal governed by [Fill in state] law.");
      expect(coverPage).toContain("Governing Law: Delaware");
      expect(coverPage).toContain("| Company | Acme, Inc. | Globex LLC |");
    });

    it("does not let one answer land inside another's anchor", () => {
      // Both answers name anchors; each must still be substituted exactly once.
      const fields = completeFields({
        purpose: "[Fill in state]",
        modifications: "[Fill in state]",
        governingLaw: "Delaware",
      });
      const { coverPage } = splitAgreement(render(fields));
      expect(coverPage.match(/\[Fill in state\]/g)).toHaveLength(2);
      expect(coverPage).toContain("Governing Law: Delaware");
    });

    it("keeps non-ASCII text intact", () => {
      const fields = completeFields({
        party1: { ...completeFields().party1, company: "Ærø Sørensen GmbH 株式会社" },
      });
      expect(render(fields)).toContain("Ærø Sørensen GmbH 株式会社");
    });
  });

  describe("template drift", () => {
    /** Every anchor `fillCoverPage` relies on, with the text it matches. */
    const ANCHORS: [description: string, snippet: string][] = [
      ["Purpose", "[Evaluating whether to enter into a business relationship with the other party.]"],
      ["Effective Date", "[Today’s date]"],
      ["MNDA Term (fixed years)", "- [x]     Expires [1 year(s)] from Effective Date."],
      [
        "MNDA Term (until terminated)",
        "- [ ]     Continues until terminated in accordance with the terms of the MNDA.",
      ],
      [
        "Term of Confidentiality (fixed years)",
        "- [x]     [1 year(s)] from Effective Date, but in the case of trade secrets until " +
          "Confidential Information is no longer considered a trade secret under applicable laws.",
      ],
      ["Term of Confidentiality (perpetual)", "- [ ]     In perpetuity."],
      ["Governing Law", "[Fill in state]"],
      [
        "Jurisdiction",
        "[Fill in city or county and state, i.e. “courts located in New Castle, DE”]",
      ],
      ["MNDA Modifications", "List any modifications to the MNDA"],
      ["Print Name row", "| Print Name | |"],
      ["Title row", "| Title | | |"],
      ["Company row", "| Company | | |"],
      [
        "Notice Address row",
        "| Notice Address <label>Use either email or postal address</label> | | |",
      ],
    ];

    it("names anchors that are really in the template", () => {
      for (const [, snippet] of ANCHORS) {
        expect(templates.coverPage, snippet).toContain(snippet);
      }
    });

    it.each(ANCHORS)("fails loudly when the %s anchor disappears", (description, snippet) => {
      const coverPage = templates.coverPage.replace(snippet, "");
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        TemplateAnchorError,
      );
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        new RegExp(`"${description.replace(/[()]/g, "\\$&")}" matched 0 times`),
      );
    });

    it.each(ANCHORS)("fails loudly when the %s anchor is duplicated", (description, snippet) => {
      const coverPage = `${templates.coverPage}\n${snippet}\n`;
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        new RegExp(`"${description.replace(/[()]/g, "\\$&")}" matched 2 times`),
      );
    });

    it("says where to look when it fails", () => {
      const coverPage = templates.coverPage.replace("[Fill in state]", "");
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        /templates\/ has changed in a way this renderer does not understand/,
      );
    });

    it("is an Error subclass with a stable name", () => {
      const error = new TemplateAnchorError("Governing Law", 0);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TemplateAnchorError");
    });

    /**
     * Single-pass substitution assumes the anchors do not overlap. If drift ever
     * puts one inside another, the splice would silently drop text, so it stops.
     */
    it("fails loudly when two anchors overlap", () => {
      // The Governing Law blank is moved inside the Title row rather than copied,
      // so each anchor still matches exactly once and only the overlap is at fault.
      const coverPage = templates.coverPage
        .replace("Governing Law: [Fill in state]", "Governing Law: as stated below")
        .replace("| Title | | |", "| Title | [Fill in state] | |");
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        TemplateOverlapError,
      );
      expect(() => renderAgreement(completeFields(), { ...templates, coverPage })).toThrow(
        /overlaps another anchor/,
      );
    });

    it("names the overlapping anchor and where to look", () => {
      const error = new TemplateOverlapError("Title row");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TemplateOverlapError");
      expect(error.message).toMatch(/templates\/ has changed/);
    });

    it("survives standard terms that have lost their cross-reference spans", () => {
      // Unlike the cover page, these are cosmetic: no span simply means no bold.
      const standardTerms = "1. **Introduction**. Plain text with no spans.";
      expect(renderAgreement(completeFields(), { ...templates, standardTerms })).toContain(
        "Plain text with no spans.",
      );
    });
  });
});

describe("documentFilename", () => {
  it("names the file after both companies", () => {
    expect(documentFilename(completeFields(), ".md")).toBe("mutual-nda-acme-inc-globex-llc.md");
  });

  it("applies the extension it is given", () => {
    expect(documentFilename(completeFields(), ".pdf")).toBe("mutual-nda-acme-inc-globex-llc.pdf");
  });

  it("falls back to a plain name when no company is filled in", () => {
    expect(documentFilename(defaultFields(), ".md")).toBe("mutual-nda.md");
  });

  it("skips a company that is missing rather than leaving a gap", () => {
    const fields = completeFields({
      party1: { ...completeFields().party1, company: "" },
    });
    expect(documentFilename(fields, ".md")).toBe("mutual-nda-globex-llc.md");
  });

  it.each([
    ["Acme, Inc.", "acme-inc"],
    ["ACME", "acme"],
    ["A & B  Partners", "a-b-partners"],
    ["Ærø ApS", "r-aps"],
    ["  spaced  ", "spaced"],
    ["...", ""],
    ["Node.js/Co", "node-js-co"],
  ])("slugs %j to %j", (company, slug) => {
    const fields = completeFields({
      party1: { ...completeFields().party1, company },
      party2: { printName: "", title: "", company: "", noticeAddress: "" },
    });
    expect(documentFilename(fields, ".md")).toBe(["mutual-nda", slug].filter(Boolean).join("-") + ".md");
  });

  it("produces a name with no path separators or characters a filesystem rejects", () => {
    const hostile = 'A/B\\C:D*E?F"G<H>I|J';
    const fields = completeFields({
      party1: { ...completeFields().party1, company: hostile },
      party2: { ...completeFields().party2, company: "../../etc/passwd" },
    });
    expect(documentFilename(fields, ".md")).toMatch(/^[a-z0-9-]+\.md$/);
  });

  it("ignores the default purpose and other fields entirely", () => {
    const fields = completeFields({ purpose: DEFAULT_PURPOSE });
    expect(documentFilename(fields, ".md")).toBe("mutual-nda-acme-inc-globex-llc.md");
  });
});
