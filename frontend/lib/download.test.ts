import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "./download";

/**
 * jsdom implements neither object URLs nor navigation, so both ends are stubbed:
 * `createObjectURL` hands back a token, and the anchor's click is intercepted.
 * What is worth testing here is the lifecycle — the link is added, clicked,
 * removed, and the URL revoked — because a leaked object URL keeps the whole
 * document alive in memory.
 */

/** jsdom's URL has no object-URL support at all, so both halves are supplied. */
interface ObjectUrls {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}
const objectUrls = URL as unknown as Partial<ObjectUrls>;

let blobs: Blob[];
let revoked: string[];
let clicked: HTMLAnchorElement[];
let originals: Partial<ObjectUrls>;

beforeEach(() => {
  blobs = [];
  revoked = [];
  clicked = [];

  originals = {
    createObjectURL: objectUrls.createObjectURL,
    revokeObjectURL: objectUrls.revokeObjectURL,
  };
  objectUrls.createObjectURL = (blob) => {
    blobs.push(blob);
    return `blob:mock/${blobs.length}`;
  };
  objectUrls.revokeObjectURL = (url) => {
    revoked.push(url);
  };

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  if (originals.createObjectURL) objectUrls.createObjectURL = originals.createObjectURL;
  else delete objectUrls.createObjectURL;

  if (originals.revokeObjectURL) objectUrls.revokeObjectURL = originals.revokeObjectURL;
  else delete objectUrls.revokeObjectURL;

  vi.restoreAllMocks();
});

const download = () => downloadText("mutual-nda-acme-globex.md", "# Agreement\n", "text/markdown");

describe("downloadText", () => {
  it("clicks a link carrying the requested filename", () => {
    download();
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("mutual-nda-acme-globex.md");
  });

  it("points the link at the object URL it created", () => {
    download();
    expect(clicked[0].getAttribute("href")).toBe("blob:mock/1");
  });

  it("saves exactly the text it was given", async () => {
    download();
    expect(blobs).toHaveLength(1);
    expect(await blobs[0].text()).toBe("# Agreement\n");
  });

  it("declares the MIME type and UTF-8, so typographic quotes are not mangled", () => {
    downloadText("a.md", "“Cover Page”", "text/markdown");
    expect(blobs[0].type).toBe("text/markdown;charset=utf-8");
  });

  it("carries non-ASCII text through unchanged", async () => {
    downloadText("a.md", "Ærø — “Cover Page” 株式会社", "text/markdown");
    expect(await blobs[0].text()).toBe("Ærø — “Cover Page” 株式会社");
  });

  it("leaves nothing behind in the document", () => {
    download();
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("attaches the link before clicking it, as Firefox requires", () => {
    let parentAtClick: ParentNode | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      parentAtClick = this.parentNode;
    });
    download();
    expect(parentAtClick).toBe(document.body);
  });

  it("revokes the object URL it created", () => {
    download();
    expect(revoked).toEqual(["blob:mock/1"]);
  });

  it("creates and revokes one URL per download", () => {
    download();
    download();
    expect(blobs).toHaveLength(2);
    expect(revoked).toEqual(["blob:mock/1", "blob:mock/2"]);
  });

  it("passes an arbitrary MIME type through", () => {
    downloadText("a.txt", "text", "text/plain");
    expect(blobs[0].type).toBe("text/plain;charset=utf-8");
  });

  it("saves an empty document rather than failing", async () => {
    downloadText("empty.md", "", "text/markdown");
    expect(await blobs[0].text()).toBe("");
    expect(clicked).toHaveLength(1);
  });
});
