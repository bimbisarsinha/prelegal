# Testing the Mutual NDA creator

Two halves. The automated suite covers everything that can be asserted about a string or
a DOM node, which is most of the app's behaviour. The manual plan covers the rest — and the
rest is not small, because the two things this app finally produces are **a PDF made by the
browser's print engine** and **a file on the user's disk**, and jsdom can make neither.

## Automated tests

```bash
npm test               # 290 tests, ~18s
npm run test:watch     # re-runs on change
npm run test:coverage   # 99% of statements
npm run typecheck      # tsc --noEmit
npm run lint
```

Vitest with jsdom. `lib/templates.ts` resolves `templates/` from `process.cwd()`, the way
`next build` does, so `test/globalSetup.ts` chdirs to this directory before the suite runs —
Vite's `root` option scopes which files are collected but does not change the working
directory, so without it the real-file tests break when the runner is invoked from the
repository root.

| File | What it holds down |
| --- | --- |
| `lib/fields.test.ts` | Date and year formatting, validation rules, which fields are optional. Includes the guard that `formatDate` never parses through `Date`, whose UTC-midnight behaviour would desynchronise the server and browser renders. |
| `lib/render.test.ts` | The substitution rules: every cover page placeholder filled, no cross-reference in the Standard Terms ever spliced, `$` in user text never read as a backreference, checkbox pairs consistent, and one case per template anchor asserting the build breaks when it moves or is duplicated. Also that an answer quoting the template's own anchors is treated as text — anchors are matched against the pristine template for exactly this reason. |
| `lib/markdown.test.tsx` | The parser and renderer per construct, plus the escaping tests: script tags, event handlers and injected markup all render as visible text. |
| `lib/templates.test.ts` | Template loading, its error message, and the build-time drift check. Also asserts the files on disk still carry the placeholders the renderer expects. |
| `lib/download.test.ts` | The object-URL lifecycle — created, attached, clicked, removed, revoked — because a leaked object URL pins the whole document in memory. |
| `components/NdaForm.test.tsx` | Labelling and ARIA wiring: every control reachable by label, hints and errors in the accessible description, radios mutually exclusive, year input disabled when unused. |
| `components/NdaCreator.test.tsx` | The app as a user drives it: the preview following the form, downloads refused while anything is missing, and the saved Markdown being byte-for-byte the document that was on screen. |
| `app/page.test.tsx` | The server component reading `templates/` from disk through to rendered DOM — the same failure `next build` would hit. |

### What the suite deliberately does not assert

- **Line endings.** `templates/` is checked out CRLF on Windows and LF elsewhere, so the
  rendered document's endings are a checkout artifact. `test/support.ts` normalises them.
- **Tailwind class names**, beyond the two that carry behaviour rather than looks
  (`document-break`, which the print stylesheet breaks pages on, and the `italic` hint span).
  Asserting on styling classes makes restyling fail the suite for no benefit.
- **Print output.** `window.print` is stubbed. Case 1 below is the only real coverage.

---

## Manual test plan

Run cases 1–4 before any release; they cover the output no automated test can see. The rest
are worth a pass when the relevant area changes.

```bash
npm run build && npm start     # test the production build, not the dev server
```

### 1. Print to PDF — the actual document

The "Download PDF" button calls `window.print()`. Nothing automated sees the result.

1. Fill in every field. Use a long purpose (3+ lines) and a multi-line postal address.
2. Click **Download PDF** and choose *Save as PDF*.
3. Open the file and check:
   - [ ] The form, buttons and heading are **absent** — only the agreement is on the page.
   - [ ] The Standard Terms **begin on page 2**; the cover page is not split.
   - [ ] The signature table is not broken across a page boundary.
   - [ ] No clause is split leaving one orphaned line at a page break.
   - [ ] Checkboxes show a visible box, with `×` in the selected one only. This is the
         highest-risk item: the box is a bordered `<span>`, and browsers vary in whether
         they print borders and background colours by default.
   - [ ] Margins are even and nothing is clipped at the right edge.
   - [ ] Signature and Date rows are blank, with room to sign.
   - [ ] The CC BY 4.0 attribution is present on the last page.

Repeat in **Chrome, Firefox and Safari** — print CSS support (`break-after`, `orphans`,
`widows`) differs most between engines. Note that Firefox historically ignores `orphans`
and `widows`.

### 2. Download the Markdown and read it back

1. Complete the form and click **Download Markdown**.
2. Check:
   - [ ] The filename is `mutual-nda-<company>-<company>.md`.
   - [ ] Opening it in a Markdown viewer (GitHub, VS Code preview) shows the signature
         table as a table — not as a wall of pipes.
   - [ ] Typographic quotes (`“ ”`), the `—` and any non-ASCII company name are intact,
         not mojibake. This is the UTF-8 declaration in `lib/download.ts` doing its job.
   - [ ] The text matches the on-screen preview exactly.
3. Download twice and confirm the second file is identical and the browser does not stall
   (a leaked object URL would show up as growing memory in the task manager).

### 3. Adversarial input

The renderer escapes `$` sequences, folds newlines and escapes pipes in table cells. Confirm
by hand, because these are the inputs that quietly corrupt a document rather than erroring.

| Field | Input | Expected |
| --- | --- | --- |
| Company | `Acme \| Globex Holdings` | Shown in one cell; columns not shifted |
| Company | `A\\\|B` (a backslash then a pipe) | One cell in the preview **and** in a GFM viewer |
| Notice address | three lines of a postal address | One cell, joined with commas; Date row still in the table |
| Purpose | `Evaluating a $1,000,000 deal ($& included)` | Verbatim, no mangling |
| Purpose | `A deal governed by [Fill in state] law.` | Shown verbatim; page does **not** go blank |
| Modifications | `\| Title \| see side letter \| as above \|` | Shown as text; the signature table is intact |
| Company | `<script>alert(1)</script>` | Visible as text; no dialog |
| Modifications | `**bold** and [a link](https://example.com)` | Renders as bold and a link — Markdown in this field is *intentionally* live |
| Company | 200 characters, no spaces | Wraps inside the cell; does not overflow the page |
| Signatory name | emoji, RTL text (`شركة`), CJK | Renders; check the PDF too, where font fallback differs |
| MNDA term years | `0`, `-1`, `1.5`, `999999` | First three refuse download with a message; the last is accepted (no upper bound by design) |

### 4. Download gating

- [ ] On a fresh form, click **Download Markdown**: nothing downloads, a summary appears
      listing every missing field, and the fields themselves are marked red.
- [ ] Fill one listed field: its entry leaves the summary and its red mark clears.
- [ ] Click **Download PDF** on an incomplete form: no print dialog opens.
- [ ] Leave only the signatory *titles* empty and download: it succeeds, and the Title row
      has empty cells.

### 5. Keyboard and screen reader

- [ ] <kbd>Tab</kbd> reaches every control in a sensible order; the focus ring is visible
      on both buttons and all inputs.
- [ ] Arrow keys move between the two radios of a pair, and the disabled year input is
      skipped when its option is not selected.
- [ ] With VoiceOver (macOS) or NVDA (Windows): each field announces its label, its hint,
      and — after a failed download — its error.
- [ ] The error summary is announced when it appears without focus being stolen
      (it is an `aria-live="polite"` region).
- [ ] In the preview, each checkbox announces "Selected:" or "Not selected:" — a sighted
      reader gets this from the `×` glyph, and a screen reader must not be left guessing.

### 6. Layout and appearance

- [ ] At ≥1024px the form and document sit side by side, the form column sticks while the
      document scrolls, and the form scrolls internally when it is taller than the viewport.
- [ ] At 375px (iPhone SE) the columns stack, the document is readable, and nothing
      scrolls horizontally.
- [ ] In OS dark mode the form inverts but the **document stays on white paper** — it is
      what gets printed and signed.
- [ ] At 200% browser zoom nothing is clipped or overlapped.

### 7. Date handling

`formatDate` is built from the ISO string's own parts specifically to avoid time zone
skew. Worth confirming against real browsers:

- [ ] Set the OS time zone to `Pacific/Kiritimati` (UTC+14), pick a date, and confirm the
      preview shows the date you picked. Repeat at `Pacific/Midway` (UTC-11).
- [ ] In a browser with a non-US locale, the date input's own display format may differ —
      the rendered document must still read `August 12, 2026`.
- [ ] Type an incomplete date (`2026-08`) and confirm the document shows a blank line
      rather than a partial date.

### 8. Template drift — the build-time guard

The one case that must be tested by breaking something on purpose. `templates/` holds
upstream files that may be re-synced from Common Paper.

1. In `templates/mutual-nda-coverpage.md`, change `[Fill in state]` to `[Fill in the state]`.
2. Run `npm run build`.
   - [ ] The build **fails** with `Template anchor "Governing Law" matched 0 times`.
3. Revert, duplicate the `- [ ]     In perpetuity.` line, and build again.
   - [ ] The build fails with `matched 2 times`.
4. Revert and confirm the build passes.
5. Rename `templates/` and build.
   - [ ] The build fails with `Could not read the MNDA template at …`, naming the path.

### 9. Privacy claim

The interface states that nothing is uploaded. It is a claim about user data in a legal
document, so verify it rather than trusting it.

1. Open DevTools → Network, tick *Preserve log*, and reload.
2. Fill in the whole form and download both formats.
   - [ ] No request carries any field value — no XHR, no fetch, no beacon, no image with a
         query string. The only requests are the page, its static assets and the favicon.
3. Turn off networking entirely (DevTools → Offline) after the page has loaded.
   - [ ] The form, preview and both downloads still work.

### 10. Legal review

Not a software test, and not optional. The suite proves the document is assembled as
designed; it cannot prove the design is right.

- [ ] A human reads a completed agreement end to end against the published
      [Common Paper Mutual NDA 1.0](https://commonpaper.com/standards/mutual-nda/1.0) and
      confirms no clause has been altered, dropped or reordered.
- [ ] The cover page's selected options match what was entered on the form.
- [ ] The CC BY 4.0 attribution required by `templates/LICENSE.md` is carried into both
      the Markdown and the PDF.
