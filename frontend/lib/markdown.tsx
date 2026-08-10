/**
 * A small Markdown renderer covering exactly the constructs the two MNDA
 * templates use: headings, paragraphs, bold, links, `<label>` hints, checkbox
 * lists, the numbered Standard Terms, and the signature table.
 *
 * Purpose-built rather than a general parser for one reason that matters here:
 * it emits React elements, never HTML strings. Party names, purpose text and
 * modifications flow from user input into this document, and React escapes
 * every one of them. A parser that emitted HTML would need `dangerouslySet-
 * InnerHTML` and a sanitiser to be equally safe.
 */

import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "checklist"; items: { checked: boolean; text: string }[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "break" };

const HEADING = /^(#{1,6}) +(.*)$/;
const CHECK_ITEM = /^- \[([ x])\] +(.*)$/;
const ORDERED_ITEM = /^\d+\. +(.*)$/;
const BREAK = /^-{3,}$/;

function splitRow(line: string): string[] {
  const cells = line.split("|");
  // A well-formed row has empty strings either side of the outer pipes.
  return cells.slice(1, -1).map((cell) => cell.trim());
}

const isSeparatorRow = (cells: string[]) => cells.every((cell) => /^:?-{3,}:?$/.test(cell));

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  /** The block still open for more lines, so lists survive blank lines between items. */
  const openList = (): Block | undefined => {
    const last = blocks[blocks.length - 1];
    return paragraph.length === 0 && (last?.kind === "checklist" || last?.kind === "ordered")
      ? last
      : undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    if (BREAK.test(line.trim())) {
      flushParagraph();
      blocks.push({ kind: "break" });
      continue;
    }

    const check = CHECK_ITEM.exec(line);
    if (check) {
      flushParagraph();
      const item = { checked: check[1] === "x", text: check[2] };
      const open = openList();
      if (open?.kind === "checklist") open.items.push(item);
      else blocks.push({ kind: "checklist", items: [item] });
      continue;
    }

    const ordered = ORDERED_ITEM.exec(line);
    if (ordered) {
      flushParagraph();
      const open = openList();
      if (open?.kind === "ordered") open.items.push(ordered[1]);
      else blocks.push({ kind: "ordered", items: [ordered[1]] });
      continue;
    }

    if (line.startsWith("|")) {
      flushParagraph();
      const table: string[][] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        const cells = splitRow(lines[index]);
        if (!isSeparatorRow(cells)) table.push(cells);
        index += 1;
      }
      index -= 1;

      const [header = [], ...rows] = table;
      // The upstream template has a row short of a cell; pad so columns align.
      const width = Math.max(header.length, ...rows.map((row) => row.length));
      const pad = (row: string[]) => [...row, ...Array(width - row.length).fill("")];
      blocks.push({ kind: "table", header: pad(header), rows: rows.map(pad) });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|<label>([\s\S]*?)<\/label>/g;

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    if (at > cursor) nodes.push(text.slice(cursor, at));

    const [full, bold, linkText, href, label] = match;
    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else if (linkText !== undefined) {
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {linkText}
        </a>,
      );
    } else if (label !== undefined) {
      nodes.push(
        <span key={key++} className="block text-xs font-normal italic text-slate-500">
          {label}
        </span>,
      );
    }
    cursor = at + full.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

const HEADING_STYLES: Record<number, string> = {
  1: "mt-0 mb-6 text-center text-2xl font-bold tracking-tight",
  2: "mt-8 mb-3 text-sm font-bold uppercase tracking-widest text-slate-600",
  3: "mt-6 mb-2 text-base font-bold",
};

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 6)}` as "h1";
      return (
        <Tag key={key} className={HEADING_STYLES[block.level] ?? "mt-6 mb-2 font-bold"}>
          {renderInline(block.text)}
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p key={key} className="my-3 leading-relaxed">
          {renderInline(block.text)}
        </p>
      );

    case "checklist":
      return (
        <ul key={key} className="my-3 space-y-2">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3 leading-relaxed">
              <span
                aria-hidden
                className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center border border-slate-500 text-[11px] leading-none font-bold"
              >
                {item.checked ? "×" : ""}
              </span>
              <span className="sr-only">{item.checked ? "Selected:" : "Not selected:"}</span>
              <span className={item.checked ? "" : "text-slate-400"}>
                {renderInline(item.text)}
              </span>
            </li>
          ))}
        </ul>
      );

    case "ordered":
      return (
        <ol key={key} className="my-3 list-decimal space-y-3 pl-6">
          {block.items.map((item, index) => (
            <li key={index} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <table key={key} className="my-5 w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th
                  key={index}
                  className="border border-slate-300 bg-slate-50 p-2 text-left align-top font-bold"
                >
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`border border-slate-300 p-2 align-top ${
                      cellIndex === 0 ? "font-semibold" : "break-words"
                    }`}
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "break":
      return <hr key={key} className="document-break my-8 border-slate-300" />;
  }
}

export function Markdown({ source }: { source: string }) {
  return <Fragment>{parse(source).map(renderBlock)}</Fragment>;
}
