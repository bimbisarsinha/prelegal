import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NdaCreator } from "./NdaCreator";
import { downloadText } from "@/lib/download";
import { renderAgreement } from "@/lib/render";
import { PARTY_1, PARTY_2, completeFields, realTemplates } from "@/test/support";

/**
 * The whole app, driven the way a user drives it. Downloading and printing are
 * the two things jsdom cannot do, so they are stubbed; everything between the
 * keystroke and the finished document is real.
 */

vi.mock("@/lib/download", () => ({ downloadText: vi.fn() }));

const templates = realTemplates();
const download = vi.mocked(downloadText);

function setup() {
  render(<NdaCreator templates={templates} />);
  return userEvent.setup();
}

const preview = () => screen.getByRole("article", { name: "Mutual NDA preview" });
const previewText = () => preview().textContent ?? "";
const downloadPdf = () => screen.getByRole("button", { name: "Download PDF" });
const downloadMarkdown = () => screen.getByRole("button", { name: "Download Markdown" });

/**
 * The field set `completeTheForm` below produces: the suggested purpose and the
 * default one-year terms, plus every blank filled in.
 */
const formFields = () => completeFields({ mndaTermYears: "1", confidentialityYears: "1" });

/**
 * Fill in everything `validate` requires, leaving the suggested purpose alone.
 *
 * Values are set with a single change event per field rather than typed. Every
 * keystroke re-renders the whole eleven-clause document, so typing all of this
 * out costs seconds without testing anything the dedicated liveness tests above
 * do not already cover.
 */
function completeTheForm() {
  const fill = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

  fill(screen.getByLabelText("Effective date"), "2026-08-12");
  fill(screen.getByLabelText("Governing law"), "Delaware");
  fill(screen.getByLabelText("Jurisdiction"), "courts located in New Castle, DE");

  for (const [index, party] of [PARTY_1, PARTY_2].entries()) {
    fill(screen.getAllByLabelText("Company")[index], party.company);
    fill(screen.getAllByLabelText("Signatory name")[index], party.printName);
    fill(screen.getAllByLabelText("Notice address")[index], party.noticeAddress);
    fill(screen.getAllByLabelText("Signatory title")[index], party.title);
  }
}

beforeEach(() => {
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  download.mockReset();
});

describe("first load", () => {
  it("shows the form and the document side by side", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Mutual NDA creator" })).toBeInTheDocument();
    expect(preview()).toBeInTheDocument();
  });

  it("says that nothing is uploaded", () => {
    setup();
    expect(screen.getByText(/nothing is uploaded/)).toBeInTheDocument();
  });

  it("previews the whole agreement, not just the cover page", () => {
    setup();
    expect(previewText()).toContain("Standard Terms");
    expect(previewText()).toContain("Equitable Relief");
  });

  it("shows a line to sign over for each answer not yet given", () => {
    setup();
    expect(previewText()).toContain("________");
  });

  it("does not complain before the user has tried to download", () => {
    setup();
    expect(screen.queryByText(/Complete these before downloading/)).not.toBeInTheDocument();
    expect(screen.queryByText("Governing law is required.")).not.toBeInTheDocument();
  });
});

describe("the preview follows the form", () => {
  it("shows a company as it is typed", async () => {
    const user = setup();
    await user.type(screen.getAllByLabelText("Company")[0], "Acme, Inc.");
    expect(within(preview()).getByText("Acme, Inc.")).toBeInTheDocument();
  });

  it("shows both parties in the signature block", async () => {
    const user = setup();
    await user.type(screen.getAllByLabelText("Company")[0], "Acme, Inc.");
    await user.type(screen.getAllByLabelText("Company")[1], "Globex LLC");
    const row = within(preview()).getByText("Company").closest("tr");
    expect(row).toHaveTextContent("Acme, Inc.");
    expect(row).toHaveTextContent("Globex LLC");
  });

  it("writes the effective date out in full", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Effective date"), "2026-08-12");
    expect(previewText()).toContain("August 12, 2026");
  });

  it("replaces the purpose without disturbing the standard terms", async () => {
    const user = setup();
    const purpose = screen.getByLabelText("Purpose");
    await user.clear(purpose);
    await user.type(purpose, "Evaluating a joint bid.");
    expect(previewText()).toContain("Evaluating a joint bid.");
    // Clause 2 still cross-references the Purpose rather than quoting it.
    expect(previewText()).toContain("solely for the Purpose");
    expect(previewText().match(/Evaluating a joint bid\./g)).toHaveLength(1);
  });

  it("ticks the option the user chose", async () => {
    const user = setup();
    const perpetual = within(
      screen.getByRole("group", { name: "Term of confidentiality" }),
    ).getAllByRole("radio")[1];
    await user.click(perpetual);
    expect(previewText()).toContain("Selected:In perpetuity.");
  });

  it("shows a year count as it changes", async () => {
    const user = setup();
    const years = screen.getByLabelText("MNDA term in years");
    await user.clear(years);
    await user.type(years, "7");
    expect(previewText()).toContain("Expires 7 years from Effective Date");
  });

  it("records 'None.' until modifications are entered", async () => {
    const user = setup();
    expect(previewText()).toContain("None.");
    await user.type(screen.getByLabelText("Modifications"), "Clause 8 is struck.");
    expect(previewText()).toContain("Clause 8 is struck.");
  });

  it("keeps a multi-line postal address inside its cell", async () => {
    const user = setup();
    await user.type(
      screen.getAllByLabelText("Notice address")[0],
      "123 Main St{enter}Springfield, IL 62704",
    );
    const row = within(preview()).getByText(/Notice Address/).closest("tr");
    expect(row).toHaveTextContent("123 Main St, Springfield, IL 62704");
    // The table must still end with the Date row rather than breaking early.
    expect(within(preview()).getByText("Date").closest("table")).toBe(row?.closest("table"));
  });

  it("keeps a pipe in a company name inside its cell", async () => {
    const user = setup();
    await user.type(screen.getAllByLabelText("Company")[0], "Acme | Globex Holdings");
    const row = within(preview()).getByText("Company").closest("tr");
    expect(row?.querySelectorAll("td")).toHaveLength(3);
    expect(row).toHaveTextContent("Acme | Globex Holdings");
  });

  /**
   * `renderAgreement` runs in a `useMemo` during render and there is no error
   * boundary, so a throw here does not degrade — React unmounts the tree and the
   * user loses every answer they had typed. Text that happens to quote the
   * template used to do exactly that.
   */
  it("survives a purpose that quotes the template's own placeholders", () => {
    setup();
    // Set in one event rather than typed: `[` is a key descriptor to user-event.
    fireEvent.change(screen.getByLabelText("Purpose"), {
      target: { value: "Evaluating a deal governed by [Fill in state] law." },
    });

    expect(preview()).toBeInTheDocument();
    expect(previewText()).toContain("Evaluating a deal governed by [Fill in state] law.");
  });

  it("survives modifications that quote a signature table row", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Modifications"), "| Title | see side letter | as above |");
    expect(preview()).toBeInTheDocument();
    expect(within(preview()).getByText("Print Name")).toBeInTheDocument();
  });

  it("shows text that looks like markup as text", async () => {
    const user = setup();
    await user.type(screen.getAllByLabelText("Company")[0], "<b>Acme</b>");
    expect(within(preview()).getByText("<b>Acme</b>")).toBeInTheDocument();
    expect(preview().querySelector("b")).not.toBeInTheDocument();
  });
});

describe("downloading before the agreement is complete", () => {
  it("refuses and lists what is missing", async () => {
    const user = setup();
    await user.click(downloadMarkdown());
    expect(download).not.toHaveBeenCalled();

    const summary = screen.getByText(/Complete these before downloading/).closest("div");
    expect(summary).toHaveTextContent("Effective date is required.");
    expect(summary).toHaveTextContent("Governing law is required.");
    expect(summary).toHaveTextContent("Party 1: company is required.");
    expect(summary).toHaveTextContent("Party 2: notice address is required.");
  });

  it("announces the list politely rather than stealing focus", async () => {
    const user = setup();
    await user.click(downloadMarkdown());
    const live = screen.getByText(/Complete these before downloading/).closest("[aria-live]");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("marks the offending fields, so the user can see where to look", async () => {
    const user = setup();
    await user.click(downloadMarkdown());
    expect(screen.getByLabelText("Governing law")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByLabelText("Company")[0]).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Purpose")).not.toHaveAttribute("aria-invalid");
  });

  it("refuses to print an incomplete agreement too", async () => {
    const user = setup();
    await user.click(downloadPdf());
    expect(window.print).not.toHaveBeenCalled();
    expect(screen.getByText(/Complete these before downloading/)).toBeInTheDocument();
  });

  it("clears a complaint as soon as the field is filled in", async () => {
    const user = setup();
    await user.click(downloadMarkdown());
    // Once in the summary, once beneath the field itself.
    expect(screen.getAllByText("Governing law is required.")).toHaveLength(2);

    await user.type(screen.getByLabelText("Governing law"), "Delaware");
    expect(screen.queryAllByText("Governing law is required.")).toHaveLength(0);
    expect(screen.getByLabelText("Governing law")).not.toHaveAttribute("aria-invalid");
  });

  it("still refuses while anything is missing", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Governing law"), "Delaware");
    await user.click(downloadMarkdown());
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByText(/Complete these before downloading/)).toBeInTheDocument();
  });

  it("rejects a year count of zero", async () => {
    const user = setup();
    const years = screen.getByLabelText("MNDA term in years");
    await user.clear(years);
    await user.type(years, "0");
    await user.click(downloadMarkdown());
    expect(download).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("MNDA term must be a whole number of years, at least 1."),
    ).toHaveLength(2);
  });
});

describe("downloading a finished agreement", () => {
  it("saves it as Markdown named after both companies", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadMarkdown());

    expect(download).toHaveBeenCalledTimes(1);
    const [filename, , mimeType] = download.mock.calls[0];
    expect(filename).toBe("mutual-nda-acme-inc-globex-llc.md");
    expect(mimeType).toBe("text/markdown");
  });

  /** The point of rendering once: what is signed on screen is what is saved. */
  it("saves exactly the document that was on screen", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadMarkdown());

    const [, saved] = download.mock.calls[0];
    expect(saved).toBe(renderAgreement(formFields(), templates));
  });

  it("saves a complete agreement, with no lines left to fill in", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadMarkdown());

    const [, saved] = download.mock.calls[0];
    expect(saved).not.toContain("________");
    expect(saved).not.toContain("[Fill in");
    expect(saved).toContain("| Print Name | Dana Reyes | Sam Okafor |");
  });

  it("leaves Signature and Date blank for the parties to sign", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadMarkdown());

    const [, saved] = download.mock.calls[0];
    expect(saved).toContain("| Signature | | |");
    expect(saved).toContain("| Date | | |");
  });

  /**
   * The saved file is read by other Markdown renderers, so its escaping has to be
   * correct there too, not merely round-trip through this app's own parser.
   */
  it("escapes a company name so the saved table matches the preview", async () => {
    const user = setup();
    completeTheForm();
    await user.clear(screen.getAllByLabelText("Company")[0]);
    await user.type(screen.getAllByLabelText("Company")[0], "A\\|B Holdings");
    await user.click(downloadMarkdown());

    const row = within(preview()).getByText("Company").closest("tr");
    expect(row?.querySelectorAll("td")).toHaveLength(3);
    expect(row).toHaveTextContent("A\\|B Holdings");
    expect(download.mock.calls[0][1]).toContain("| Company | A\\\\\\|B Holdings | Globex LLC |");
  });

  it("hands the PDF to the browser's own print dialog", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadPdf());
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("shows no complaint once the form is complete", async () => {
    const user = setup();
    await user.click(downloadMarkdown());
    completeTheForm();
    expect(screen.queryByText(/Complete these before downloading/)).not.toBeInTheDocument();
  });

  it("can be downloaded more than once", async () => {
    const user = setup();
    completeTheForm();
    await user.click(downloadMarkdown());
    await user.click(downloadMarkdown());
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[0]).toEqual(download.mock.calls[1]);
  });

  it("does not need the optional title", async () => {
    const user = setup();
    completeTheForm();
    await user.clear(screen.getAllByLabelText("Signatory title")[0]);
    await user.click(downloadMarkdown());
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][1]).toContain("| Title |  |  |");
  });
});
