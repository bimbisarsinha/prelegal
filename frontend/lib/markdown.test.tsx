import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";
import { renderAgreement } from "./render";
import { completeFields, realTemplates } from "@/test/support";

/** The rendered output as a container element, for structural assertions. */
function markdown(source: string): HTMLElement {
  const { container } = render(<Markdown source={source} />);
  return container;
}

describe("headings", () => {
  it.each([
    ["#", "H1"],
    ["##", "H2"],
    ["###", "H3"],
    ["####", "H4"],
  ])("renders %s as %s", (hashes, tag) => {
    const container = markdown(`${hashes} Mutual Non-Disclosure Agreement`);
    const heading = container.firstElementChild;
    expect(heading?.tagName).toBe(tag);
    expect(heading).toHaveTextContent("Mutual Non-Disclosure Agreement");
  });

  it("stops at six hashes, past which Markdown has no heading to give", () => {
    expect(markdown("####### Deep").firstElementChild?.tagName).toBe("P");
  });

  it("needs a space after the hashes, so a #hashtag stays prose", () => {
    expect(markdown("#hashtag not a heading").firstElementChild?.tagName).toBe("P");
  });
});

describe("paragraphs", () => {
  it("joins consecutive lines into one paragraph", () => {
    const paragraphs = markdown("The first line\nand its continuation.").querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent("The first line and its continuation.");
  });

  it("splits paragraphs on a blank line", () => {
    expect(markdown("First.\n\nSecond.").querySelectorAll("p")).toHaveLength(2);
  });

  it("renders nothing for empty or whitespace-only source", () => {
    expect(markdown("").childElementCount).toBe(0);
    expect(markdown("\n  \n\t\n").childElementCount).toBe(0);
  });

  it("tolerates Windows line endings", () => {
    const paragraphs = markdown("First.\r\n\r\nSecond.").querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]).toHaveTextContent("Second.");
  });
});

describe("checkbox lists", () => {
  const source = "- [x]     Expires 3 years from Effective Date.\n- [ ]     Continues until terminated.";

  it("renders one item per checkbox line", () => {
    expect(markdown(source).querySelectorAll("li")).toHaveLength(2);
  });

  it("marks the selected option and dims the other", () => {
    const items = markdown(source).querySelectorAll("li");
    expect(items[0]).toHaveTextContent("Expires 3 years from Effective Date.");
    expect(items[1]).toHaveTextContent("Continues until terminated.");
  });

  it("announces the selection to a screen reader rather than relying on the glyph", () => {
    render(<Markdown source={source} />);
    expect(screen.getByText("Selected:")).toBeInTheDocument();
    expect(screen.getByText("Not selected:")).toBeInTheDocument();
  });

  it("hides the decorative box from assistive technology", () => {
    const boxes = markdown(source).querySelectorAll("[aria-hidden]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveTextContent("×");
    expect(boxes[1]).toHaveTextContent("");
  });

  it("keeps one list across a blank line between items", () => {
    const container = markdown("- [x] One\n\n- [ ] Two");
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("starts a new list after intervening prose", () => {
    const container = markdown("- [x] One\n\nSome prose.\n\n- [ ] Two");
    expect(container.querySelectorAll("ul")).toHaveLength(2);
  });

  it("does not treat an unfilled bracket pair as a checkbox", () => {
    expect(markdown("- [y] Neither ticked nor blank").querySelectorAll("li")).toHaveLength(0);
  });
});

describe("ordered lists", () => {
  const source = "1. **Introduction**. First clause.\n2. **Use**. Second clause.";

  it("renders an ordered list", () => {
    const container = markdown(source);
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("keeps numbering to the list, not the text", () => {
    const items = markdown(source).querySelectorAll("li");
    expect(items[0].textContent).toBe("Introduction. First clause.");
  });

  it("keeps one list across the blank lines between clauses", () => {
    expect(markdown("1. One\n\n2. Two\n\n3. Three").querySelectorAll("ol")).toHaveLength(1);
  });
});

describe("tables", () => {
  const source = [
    "|| PARTY 1 | PARTY 2 |",
    "|:--- | :----: | :----: |",
    "| Signature | | |",
    "| Print Name | Dana Reyes | Sam Okafor |",
  ].join("\n");

  it("uses the first row as the header and drops the separator", () => {
    const container = markdown(source);
    expect(container.querySelectorAll("thead th")).toHaveLength(3);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("places the cells in the right columns", () => {
    const cells = markdown(source).querySelectorAll("tbody tr:last-child td");
    expect([...cells].map((cell) => cell.textContent)).toEqual([
      "Print Name",
      "Dana Reyes",
      "Sam Okafor",
    ]);
  });

  it("pads a row that is short of a cell so the columns still align", () => {
    const ragged = "|| A | B |\n|:--- | :--- | :--- |\n| Print Name | |";
    const cells = markdown(ragged).querySelectorAll("tbody td");
    expect(cells).toHaveLength(3);
    expect(cells[2].textContent).toBe("");
  });

  it("ends the table at the first line that is not a row", () => {
    const container = markdown(`${source}\n\nA following paragraph.`);
    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("treats an escaped pipe as content, not a cell boundary", () => {
    const escaped = "|| A | B |\n|:--- | :--- | :--- |\n| Company | Acme \\| Globex | Globex LLC |";
    const cells = markdown(escaped).querySelectorAll("tbody td");
    expect(cells).toHaveLength(3);
    expect(cells[1].textContent).toBe("Acme | Globex");
  });

  it("reads an escaped backslash as one character, not as an escape", () => {
    // `A\\\|B` is an escaped backslash then an escaped pipe: one cell, `A\|B`.
    const escaped = "|| A | B |\n|:--- | :--- | :--- |\n| Company | A\\\\\\|B | Globex LLC |";
    const cells = markdown(escaped).querySelectorAll("tbody td");
    expect(cells).toHaveLength(3);
    expect(cells[1].textContent).toBe("A\\|B");
  });

  it("reads a trailing escaped backslash without swallowing the delimiter", () => {
    const escaped = "|| A | B |\n|:--- | :--- | :--- |\n| Company | Acme\\\\ | Globex LLC |";
    const cells = markdown(escaped).querySelectorAll("tbody td");
    expect(cells).toHaveLength(3);
    expect(cells[1].textContent).toBe("Acme\\");
    expect(cells[2].textContent).toBe("Globex LLC");
  });

  it("renders inline markup inside cells", () => {
    const withLink = "|| A |\n|:--- | :--- |\n| [Terms](https://example.com) | **bold** |";
    const container = markdown(withLink);
    expect(container.querySelector("td a")).toHaveAttribute("href", "https://example.com");
    expect(container.querySelector("td strong")).toHaveTextContent("bold");
  });
});

describe("page breaks", () => {
  it("renders a rule the print stylesheet can break on", () => {
    const rule = markdown("Before\n\n---\n\nAfter").querySelector("hr");
    expect(rule).toHaveClass("document-break");
  });

  it.each(["---", "----", "  ---  "])("recognises %j as a break", (line) => {
    expect(markdown(line).querySelector("hr")).toBeInTheDocument();
  });

  it("does not mistake a shorter dash run for a break", () => {
    expect(markdown("--").querySelector("hr")).not.toBeInTheDocument();
  });
});

describe("inline markup", () => {
  it("renders bold", () => {
    expect(markdown("The **Standard Terms** apply.").querySelector("strong")).toHaveTextContent(
      "Standard Terms",
    );
  });

  it("keeps the text either side of the markup", () => {
    expect(markdown("The **Standard Terms** apply.").querySelector("p")).toHaveTextContent(
      "The Standard Terms apply.",
    );
  });

  it("renders several matches on one line", () => {
    const container = markdown("**One** then **two** then **three**.");
    expect(container.querySelectorAll("strong")).toHaveLength(3);
  });

  it("leaves an unclosed bold marker as literal text", () => {
    const paragraph = markdown("An **unclosed marker.").querySelector("p");
    expect(paragraph).toHaveTextContent("An **unclosed marker.");
    expect(paragraph?.querySelector("strong")).not.toBeInTheDocument();
  });

  it("opens links in a new tab without leaking the referrer", () => {
    const link = markdown("See [CC BY 4.0](https://example.com/by/4.0/).").querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com/by/4.0/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders a <label> hint as its own line of small print", () => {
    const container = markdown("### Purpose\n<label>How Confidential Information may be used</label>");
    expect(screen.getByText("How Confidential Information may be used")).toHaveClass("italic");
    expect(container.querySelector("label")).not.toBeInTheDocument();
  });

  it("renders a label spanning several lines", () => {
    render(<Markdown source={"<label>Use either email\nor postal address</label>"} />);
    expect(screen.getByText(/Use either email/)).toBeInTheDocument();
  });
});

describe("untrusted text", () => {
  /**
   * Party names, purposes and modifications all reach this renderer from a text
   * input. It emits React elements, never HTML strings, so markup in that text
   * is inert — this is the test that keeps it that way.
   */
  it("renders a script tag as visible text, not as a script", () => {
    const container = markdown('Party: <script>alert("xss")</script>');
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container).toHaveTextContent('Party: <script>alert("xss")</script>');
  });

  it("does not create elements from an injected image handler", () => {
    const container = markdown('<img src=x onerror="alert(1)">');
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("does not let an injected label smuggle in an event handler", () => {
    const container = markdown('<label onmouseover="alert(1)">hint</label>');
    // The pattern only matches a bare <label>, so this stays literal text.
    expect(container.querySelector("[onmouseover]")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("onmouseover");
  });

  it("renders an injected table row as text inside its cell", () => {
    const container = markdown("|| A | B |\n|:--- | :--- | :--- |\n| Company | <b>x</b> | y |");
    expect(container.querySelector("td b")).not.toBeInTheDocument();
    expect(container.querySelector("tbody td:nth-child(2)")).toHaveTextContent("<b>x</b>");
  });

  it.each([
    "A stray ] bracket",
    "An unclosed [link](",
    "Nested [[brackets]]",
    "A lone * asterisk",
    "Pipes | in | prose",
    "</span> orphaned close tag",
  ])("renders %j without crashing", (source) => {
    expect(() => markdown(source)).not.toThrow();
  });
});

describe("the whole agreement", () => {
  const document = renderAgreement(completeFields(), realTemplates());

  it("renders without leaving markup or unfilled blanks on screen", () => {
    const text = markdown(document).textContent ?? "";
    expect(text).not.toContain("**");
    expect(text).not.toContain("<span");
    expect(text).not.toContain("<label>");
    expect(text).not.toContain("[Fill in");
    expect(text).not.toContain("[Today");
    // Table pipes belong to the Markdown source, not the rendered document.
    expect(text).not.toContain("|");
  });

  it("renders the structure of a signable agreement", () => {
    const container = markdown(document);
    expect(container.querySelector("h1")).toHaveTextContent("Mutual Non-Disclosure Agreement");
    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(container.querySelector("hr")).toHaveClass("document-break");
    // Eleven numbered clauses of Standard Terms.
    expect(container.querySelectorAll("ol > li")).toHaveLength(11);
  });

  it("shows both parties' details", () => {
    render(<Markdown source={document} />);
    expect(screen.getByText("Dana Reyes")).toBeInTheDocument();
    expect(screen.getByText("Globex LLC")).toBeInTheDocument();
    expect(screen.getByText("legal@acme.example")).toBeInTheDocument();
  });
});
