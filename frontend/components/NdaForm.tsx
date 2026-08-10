import type { NdaFields, Party } from "@/lib/fields";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 " +
  "focus:ring-slate-900 aria-invalid:border-red-500 aria-invalid:focus:border-red-500 " +
  "aria-invalid:focus:ring-red-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 " +
  "dark:focus:border-slate-300 dark:focus:ring-slate-300";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: "text" | "date" | "number";
  min?: number;
  rows?: number;
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  type = "text",
  min,
  rows,
}: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(props) =>
        rows ? (
          <textarea
            {...props}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        ) : (
          <input
            {...props}
            type={type}
            min={min}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        )
      }
    </FieldShell>
  );
}

/** A two-option choice where one option carries a number of years. */
interface DurationChoiceProps {
  name: string;
  legend: string;
  hint: string;
  yearsLabel: string;
  alternativeLabel: string;
  byYears: boolean;
  years: string;
  error?: string;
  onChoose: (byYears: boolean) => void;
  onYearsChange: (value: string) => void;
}

function DurationChoice({
  name,
  legend,
  hint,
  yearsLabel,
  alternativeLabel,
  byYears,
  years,
  error,
  onChoose,
  onYearsChange,
}: DurationChoiceProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">{legend}</legend>
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="radio"
          name={name}
          checked={byYears}
          onChange={() => onChoose(true)}
          className="accent-slate-900 dark:accent-slate-200"
        />
        <input
          type="number"
          min={1}
          value={years}
          disabled={!byYears}
          aria-label={`${legend} in years`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onYearsChange(event.target.value)}
          className={`w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
            disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400
            aria-invalid:border-red-500 dark:border-slate-700 dark:bg-slate-950
            dark:disabled:bg-slate-900`}
        />
        <span>{yearsLabel}</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="radio"
          name={name}
          checked={!byYears}
          onChange={() => onChoose(false)}
          className="accent-slate-900 dark:accent-slate-200"
        />
        <span>{alternativeLabel}</span>
      </label>

      {error ? <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p> : null}
    </fieldset>
  );
}

function PartyFieldset({
  index,
  party,
  onChange,
  errorFor,
}: {
  index: 1 | 2;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
  errorFor: (field: string) => string | undefined;
}) {
  const key = `party${index}`;

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold tracking-wide text-slate-900 uppercase dark:text-slate-100">
        Party {index}
      </legend>

      <TextField
        id={`${key}-company`}
        label="Company"
        value={party.company}
        onChange={(company) => onChange({ company })}
        error={errorFor(`${key}.company`)}
        placeholder="Acme, Inc."
      />
      <TextField
        id={`${key}-printName`}
        label="Signatory name"
        value={party.printName}
        onChange={(printName) => onChange({ printName })}
        error={errorFor(`${key}.printName`)}
        placeholder="Dana Reyes"
      />
      <TextField
        id={`${key}-title`}
        label="Signatory title"
        hint="Optional."
        value={party.title}
        onChange={(title) => onChange({ title })}
        placeholder="Chief Executive Officer"
      />
      <TextField
        id={`${key}-noticeAddress`}
        label="Notice address"
        hint="Email or postal address. Notices under the MNDA are delivered here."
        value={party.noticeAddress}
        onChange={(noticeAddress) => onChange({ noticeAddress })}
        error={errorFor(`${key}.noticeAddress`)}
        placeholder="legal@acme.com"
        rows={2}
      />
    </fieldset>
  );
}

export interface NdaFormProps {
  fields: NdaFields;
  onChange: (patch: Partial<NdaFields>) => void;
  onPartyChange: (key: "party1" | "party2", patch: Partial<Party>) => void;
  errorFor: (field: string) => string | undefined;
}

export function NdaForm({ fields, onChange, onPartyChange, errorFor }: NdaFormProps) {
  return (
    <form className="space-y-8" onSubmit={(event) => event.preventDefault()}>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-slate-900 uppercase dark:text-slate-100">
          The agreement
        </legend>

        <TextField
          id="purpose"
          label="Purpose"
          hint="How the confidential information may be used."
          value={fields.purpose}
          onChange={(purpose) => onChange({ purpose })}
          error={errorFor("purpose")}
          rows={3}
        />
        <TextField
          id="effectiveDate"
          label="Effective date"
          hint="The date the MNDA starts, and the date both term clocks run from."
          type="date"
          value={fields.effectiveDate}
          onChange={(effectiveDate) => onChange({ effectiveDate })}
          error={errorFor("effectiveDate")}
        />

        <DurationChoice
          name="mndaTerm"
          legend="MNDA term"
          hint="How long this MNDA lasts."
          yearsLabel="year(s) from the effective date"
          alternativeLabel="Continues until terminated"
          byYears={fields.mndaTerm === "years"}
          years={fields.mndaTermYears}
          error={errorFor("mndaTermYears")}
          onChoose={(byYears) => onChange({ mndaTerm: byYears ? "years" : "untilTerminated" })}
          onYearsChange={(mndaTermYears) => onChange({ mndaTermYears })}
        />

        <DurationChoice
          name="confidentialityTerm"
          legend="Term of confidentiality"
          hint="How long confidential information stays protected. Trade secrets are protected for as long as they remain trade secrets."
          yearsLabel="year(s) from the effective date"
          alternativeLabel="In perpetuity"
          byYears={fields.confidentialityTerm === "years"}
          years={fields.confidentialityYears}
          error={errorFor("confidentialityYears")}
          onChoose={(byYears) =>
            onChange({ confidentialityTerm: byYears ? "years" : "perpetual" })
          }
          onYearsChange={(confidentialityYears) => onChange({ confidentialityYears })}
        />

        <TextField
          id="governingLaw"
          label="Governing law"
          hint="The state whose law governs the agreement."
          value={fields.governingLaw}
          onChange={(governingLaw) => onChange({ governingLaw })}
          error={errorFor("governingLaw")}
          placeholder="Delaware"
        />
        <TextField
          id="jurisdiction"
          label="Jurisdiction"
          hint="Where disputes are heard."
          value={fields.jurisdiction}
          onChange={(jurisdiction) => onChange({ jurisdiction })}
          error={errorFor("jurisdiction")}
          placeholder="courts located in New Castle, DE"
        />
        <TextField
          id="modifications"
          label="Modifications"
          hint="Any changes to the standard terms. Left as “None.” if empty."
          value={fields.modifications}
          onChange={(modifications) => onChange({ modifications })}
          rows={2}
        />
      </fieldset>

      <PartyFieldset
        index={1}
        party={fields.party1}
        onChange={(patch) => onPartyChange("party1", patch)}
        errorFor={errorFor}
      />
      <PartyFieldset
        index={2}
        party={fields.party2}
        onChange={(patch) => onPartyChange("party2", patch)}
        errorFor={errorFor}
      />
    </form>
  );
}
