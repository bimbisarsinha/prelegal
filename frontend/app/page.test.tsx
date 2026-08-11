import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

/**
 * The server component, end to end: it reads `templates/` from disk and hands
 * the text to the client component. Nothing here is mocked, so this is the test
 * that fails if the templates move, the loader's path assumption breaks, or a
 * placeholder drifts — the same failure `next build` would hit.
 */

async function renderPage() {
  return render(await Page());
}

describe("the page", () => {
  it("renders the creator", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Mutual NDA creator" })).toBeInTheDocument();
  });

  it("prerenders the agreement text, so the browser never fetches it", async () => {
    await renderPage();
    const document = screen.getByRole("article", { name: "Mutual NDA preview" });
    expect(document).toHaveTextContent("Mutual Non-Disclosure Agreement");
    expect(document).toHaveTextContent("Use and Protection of Confidential Information");
    expect(document).toHaveTextContent("Common Paper Mutual Non-Disclosure Agreement");
  });

  it("offers both downloads", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Markdown" })).toBeInTheDocument();
  });

  it("starts with an empty form, ready to fill in", async () => {
    await renderPage();
    expect(screen.getByLabelText("Governing law")).toHaveValue("");
    expect(screen.getAllByLabelText("Company")[0]).toHaveValue("");
  });
});
