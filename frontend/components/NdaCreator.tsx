"use client";

import { useMemo, useState } from "react";
import { DocumentPreview } from "@/components/DocumentPreview";
import { NdaForm } from "@/components/NdaForm";
import { downloadText } from "@/lib/download";
import { defaultFields, validate, type NdaFields, type Party } from "@/lib/fields";
import { documentFilename, renderAgreement, type Templates } from "@/lib/render";

export function NdaCreator({ templates }: { templates: Templates }) {
  const [fields, setFields] = useState<NdaFields>(defaultFields);
  const [showErrors, setShowErrors] = useState(false);

  const markdown = useMemo(() => renderAgreement(fields, templates), [fields, templates]);
  const errors = useMemo(() => validate(fields), [fields]);

  const errorFor = (field: string) =>
    showErrors ? errors.find((error) => error.field === field)?.message : undefined;

  const update = (patch: Partial<NdaFields>) =>
    setFields((current) => ({ ...current, ...patch }));

  const updateParty = (key: "party1" | "party2", patch: Partial<Party>) =>
    setFields((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  /** A half-filled NDA is worse than none, so downloads wait until it is complete. */
  const handleDownload = (format: "markdown" | "pdf") => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }

    if (format === "markdown") {
      downloadText(documentFilename(fields, ".md"), markdown, "text/markdown");
    } else {
      // The print stylesheet hides everything but the document, so the browser's
      // own "Save as PDF" produces the file. No PDF library needed.
      window.print();
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start print:block print:max-w-none print:gap-0 print:p-0">
      <div className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2 print:hidden">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Mutual NDA creator</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Fill in the details to complete a Common Paper Mutual NDA. Everything stays in your
            browser — nothing is uploaded.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => handleDownload("markdown")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Download Markdown
          </button>
        </div>

        <div aria-live="polite">
          {showErrors && errors.length > 0 ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
              <p className="font-medium text-red-800 dark:text-red-200">
                Complete these before downloading:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-700 dark:text-red-300">
                {errors.map((error) => (
                  <li key={error.field}>{error.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <NdaForm
          fields={fields}
          onChange={update}
          onPartyChange={updateParty}
          errorFor={errorFor}
        />
      </div>

      <DocumentPreview markdown={markdown} />
    </div>
  );
}
