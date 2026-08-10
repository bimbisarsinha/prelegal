import { Markdown } from "@/lib/markdown";

/**
 * The finished agreement, on a white page regardless of the surrounding theme —
 * it is a document to be signed and printed, not a piece of the UI.
 */
export function DocumentPreview({ markdown }: { markdown: string }) {
  return (
    <article
      aria-label="Mutual NDA preview"
      className="document mx-auto w-full max-w-[52rem] bg-white p-8 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-12 print:max-w-none print:p-0 print:shadow-none print:ring-0"
    >
      <Markdown source={markdown} />
    </article>
  );
}
