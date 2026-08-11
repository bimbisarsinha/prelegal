import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NdaForm, type NdaFormProps } from "./NdaForm";
import { defaultFields } from "@/lib/fields";
import { completeFields } from "@/test/support";

/**
 * These tests cover the form's wiring rather than the document it produces:
 * that every control is reachable by its label, that errors are announced to
 * assistive technology as well as shown, and that edits arrive as patches.
 */

function setup(props: Partial<NdaFormProps> = {}) {
  const onChange = vi.fn();
  const onPartyChange = vi.fn();
  const view = render(
    <NdaForm
      fields={defaultFields()}
      onChange={onChange}
      onPartyChange={onPartyChange}
      errorFor={() => undefined}
      {...props}
    />,
  );
  return { ...view, onChange, onPartyChange, user: userEvent.setup() };
}

const LABELS = [
  "Purpose",
  "Effective date",
  "Governing law",
  "Jurisdiction",
  "Modifications",
] as const;

describe("labelling", () => {
  it.each(LABELS)("gives %s an accessible label", (label) => {
    setup();
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("labels both parties' fields unambiguously", () => {
    setup();
    for (const label of ["Company", "Signatory name", "Signatory title", "Notice address"]) {
      // One per party, and no more — a duplicate id would break the association.
      expect(screen.getAllByLabelText(label)).toHaveLength(2);
    }
  });

  it("gives every control a unique id", () => {
    const { container } = setup();
    const ids = [...container.querySelectorAll("input, textarea")]
      .map((control) => control.id)
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups the parties under their own legends", () => {
    setup();
    expect(screen.getByRole("group", { name: "Party 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Party 2" })).toBeInTheDocument();
  });

  it("marks the optional title as optional", () => {
    setup();
    expect(screen.getAllByText("Optional.")).toHaveLength(2);
  });

  it("describes a field by its hint", () => {
    setup();
    expect(screen.getByLabelText("Purpose")).toHaveAccessibleDescription(
      "How the confidential information may be used.",
    );
  });
});

describe("errors", () => {
  const errorFor = (field: string) =>
    field === "purpose" ? "Purpose is required." : undefined;

  it("shows the message", () => {
    setup({ errorFor });
    expect(screen.getByText("Purpose is required.")).toBeInTheDocument();
  });

  it("marks the field invalid for assistive technology", () => {
    setup({ errorFor });
    expect(screen.getByLabelText("Purpose")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the hint alongside the error in the accessible description", () => {
    setup({ errorFor });
    expect(screen.getByLabelText("Purpose")).toHaveAccessibleDescription(
      "How the confidential information may be used. Purpose is required.",
    );
  });

  it("leaves an untouched field unmarked", () => {
    setup({ errorFor });
    expect(screen.getByLabelText("Jurisdiction")).not.toHaveAttribute("aria-invalid");
  });

  it("marks nothing invalid when there are no errors", () => {
    const { container } = setup();
    expect(container.querySelectorAll("[aria-invalid='true']")).toHaveLength(0);
  });

  it("marks the year count invalid without stealing the radio's label", () => {
    setup({ errorFor: (field) => (field === "mndaTermYears" ? "Must be at least 1." : undefined) });
    expect(screen.getByLabelText("MNDA term in years")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be at least 1.")).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("reports a text edit as a patch of just that field", async () => {
    const { user, onChange } = setup();
    await user.type(screen.getByLabelText("Governing law"), "D");
    expect(onChange).toHaveBeenCalledWith({ governingLaw: "D" });
  });

  it("reports each party's edits against its own key", async () => {
    const { user, onPartyChange } = setup();
    const [first, second] = screen.getAllByLabelText("Company");
    await user.type(first, "A");
    expect(onPartyChange).toHaveBeenLastCalledWith("party1", { company: "A" });
    await user.type(second, "G");
    expect(onPartyChange).toHaveBeenLastCalledWith("party2", { company: "G" });
  });

  it("reports the notice address, which is a textarea", async () => {
    const { user, onPartyChange } = setup();
    await user.type(screen.getAllByLabelText("Notice address")[0], "x");
    expect(onPartyChange).toHaveBeenLastCalledWith("party1", { noticeAddress: "x" });
  });

  it("does not reload the page when the form is submitted", () => {
    const { container } = setup();
    const form = container.querySelector("form");
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });
});

describe("duration choices", () => {
  /**
   * The two radios of a pair are found through their fieldset rather than by
   * accessible name: the first option's label wraps the year input, so its name
   * is computed from that input's value, not from prose that would be stable.
   */
  const optionsFor = (legend: string) =>
    within(screen.getByRole("group", { name: legend })).getAllByRole("radio");

  const durations = [
    { legend: "MNDA term", alternative: "Continues until terminated" },
    { legend: "Term of confidentiality", alternative: "In perpetuity" },
  ] as const;

  it.each(durations)("offers exactly two options for $legend", ({ legend, alternative }) => {
    setup();
    expect(optionsFor(legend)).toHaveLength(2);
    expect(screen.getByRole("group", { name: legend })).toHaveTextContent(alternative);
    expect(screen.getByLabelText(`${legend} in years`)).toBeInTheDocument();
  });

  it("switches the MNDA term to open-ended", async () => {
    const { user, onChange } = setup();
    await user.click(optionsFor("MNDA term")[1]);
    expect(onChange).toHaveBeenCalledWith({ mndaTerm: "untilTerminated" });
  });

  it("switches confidentiality to perpetual", async () => {
    const { user, onChange } = setup();
    await user.click(optionsFor("Term of confidentiality")[1]);
    expect(onChange).toHaveBeenCalledWith({ confidentialityTerm: "perpetual" });
  });

  it("switches back to a fixed term", async () => {
    const { user, onChange } = setup({
      fields: completeFields({ mndaTerm: "untilTerminated" }),
    });
    await user.click(optionsFor("MNDA term")[0]);
    expect(onChange).toHaveBeenCalledWith({ mndaTerm: "years" });
  });

  it("reports a new year count", async () => {
    const { user, onChange } = setup({ fields: completeFields({ mndaTermYears: "" }) });
    await user.type(screen.getByLabelText("MNDA term in years"), "3");
    expect(onChange).toHaveBeenCalledWith({ mndaTermYears: "3" });
  });

  it("disables the year count while the open-ended option is chosen", () => {
    setup({ fields: completeFields({ mndaTerm: "untilTerminated" }) });
    expect(screen.getByLabelText("MNDA term in years")).toBeDisabled();
    expect(screen.getByLabelText("Term of confidentiality in years")).toBeEnabled();
  });

  it("keeps the pair of radios mutually exclusive", () => {
    setup({ fields: completeFields({ confidentialityTerm: "perpetual" }) });
    const [byYears, perpetual] = optionsFor("Term of confidentiality");
    expect(perpetual).toBeChecked();
    expect(byYears).not.toBeChecked();
  });

  it("keeps the two pairs independent, so one choice cannot clear the other", () => {
    setup({ fields: completeFields({ mndaTerm: "untilTerminated" }) });
    expect(optionsFor("MNDA term")[1]).toBeChecked();
    expect(optionsFor("Term of confidentiality")[0]).toBeChecked();
  });

  it("refuses a year count below one at the control itself", () => {
    setup();
    expect(screen.getByLabelText("MNDA term in years")).toHaveAttribute("min", "1");
  });
});

describe("prefilled values", () => {
  it("shows the answers it is given", () => {
    setup({ fields: completeFields() });
    expect(screen.getByLabelText("Governing law")).toHaveValue("Delaware");
    expect(screen.getByLabelText("Effective date")).toHaveValue("2026-08-12");
    expect(screen.getAllByLabelText("Company")[0]).toHaveValue("Acme, Inc.");
    expect(screen.getAllByLabelText("Notice address")[1]).toHaveValue("legal@globex.example");
  });

  it("suggests the template's purpose to begin with", () => {
    setup();
    expect(screen.getByLabelText("Purpose")).toHaveValue(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });
});
