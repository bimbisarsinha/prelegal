# Mutual NDA creator

A prototype web app that completes a [Common Paper](https://commonpaper.com) Mutual
Non-Disclosure Agreement. Fill in the cover page details, watch the document build itself
alongside the form, and download the finished agreement.

Implements [PL-3](https://kalyan-jira.atlassian.net/browse/PL-3).

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm test           # 290 unit and integration tests
npm run typecheck
npm run lint
```

See [TESTING.md](TESTING.md) for what the suite covers and for the manual plan — the PDF
comes out of the browser's own print engine, so a person has to look at it.

## How it works

The agreement text is **not** stored in this app. It is read at build time from the
repository's `templates/` directory — the dataset curated in PL-2 — so the legal text lives
in exactly one place and cannot drift.

Everything else runs in the browser. There is no backend and no network call: party names,
purposes and notice addresses never leave the user's machine.

```
app/page.tsx          server component — reads templates/, hands them to the client
components/           the form, the live preview, and the state that joins them
lib/fields.ts         the field set, defaults, and validation
lib/templates.ts      server-only template loading
lib/render.ts         fields + templates -> the finished Markdown document
lib/markdown.tsx      Markdown -> React elements
lib/download.ts       save-to-disk helper
```

### Two decisions worth knowing

**Cover Page placeholders are filled; Standard Terms cross-references are not.**
`[Fill in state]` on the cover page is a blank, so it gets replaced. But
`<span class="coverpage_link">Purpose</span>` in the Standard Terms is a *reference* to the
cover page — clause 2 reads "solely for the **Purpose**". Substituting the value there would
produce "solely for the Evaluating whether to enter into a business relationship...", so those
spans render as bold defined terms instead.

**A drifted template breaks the build.** Every cover page placeholder must match exactly once.
`templates/` holds upstream files that may be re-synced from Common Paper, and a moved or
reworded placeholder must fail loudly rather than quietly emit an agreement with a stray
`[Fill in state]` — or a silently missing term — in it. `lib/templates.ts` renders the document
once at build time to force that check.

## Downloads

- **Markdown** — the same text the preview is rendered from, saved as `.md`.
- **PDF** — the print stylesheet hides the interface so the browser's own *Save as PDF*
  produces the document. No PDF library, so nothing to keep patched.

Both are refused until every required field is filled — the attempt is what surfaces the list
of what is missing — because a half-completed NDA is worse than none. Signature and Date are
intentionally left blank for the parties to sign.

## Licence

The generated agreement derives from Common Paper templates licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `templates/LICENSE.md` for the
attribution that derived documents must carry.
