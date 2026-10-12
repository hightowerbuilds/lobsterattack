// The rules of tiny-axe's know-how vault format (tiny-axe docs/vault-format.md),
// as the site needs them. Ported from tiny-axe's graph/src/format.ts; both are
// checked against the same fixture (api/test/fixtures/vault).

export const SCHEMA = "tiny-axe-vault/1";

export type Kind = "site" | "page" | "control" | "path" | "tool" | "task" | "workflow" | "note";

export const FOLDERS: Record<Kind, string> = {
  site: "Sites",
  page: "Pages",
  control: "Controls",
  path: "Paths",
  tool: "Tools",
  task: "Tasks",
  workflow: "Workflows",
  // Written by the model through /api/mcp (graph_add_note), on the site only.
  note: "Notes",
};

export type Value = string | number | boolean | null | string[];

export interface Note {
  /** Frontmatter, in file order. */
  props: [string, Value][];
  body: string;
}

/** Splits a note into its frontmatter and body. Throws on a malformed note. */
export function parseNote(text: string): Note {
  if (!text.startsWith("---\n")) throw new Error("no frontmatter");
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) throw new Error("frontmatter isn't closed");
  const head = text.slice(4, end);
  const props: [string, Value][] = head.split("\n").map((line) => {
    const at = line.indexOf(": ");
    if (at < 0) throw new Error(`bad frontmatter line: ${line}`);
    return [line.slice(0, at), JSON.parse(line.slice(at + 2)) as Value];
  });
  return { props, body: text.slice(end + 5) };
}

const LINK = /(?<!\\)\[\[([^\[\]|\n#]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;

/** The basenames a body links to, in order, skipping code. */
export function links(body: string): string[] {
  const text = body.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
  return [...text.matchAll(LINK)].map((m) => m[1].trim());
}

/** Letters, digits, `.`, `_` and `-` only, at most 60 characters (tiny-axe's slug). */
export function slug(text: string): string {
  const trim = (s: string) => s.replace(/^[-.]+/, "").replace(/[-.]+$/, "");
  const ascii = text.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const s = trim(trim(ascii.replace(/[^A-Za-z0-9._-]+/g, "-")).slice(0, 60));
  return s === "" ? "note" : s;
}

/** The first 8 hex digits of SHA-256 of `kind\nkey` (tiny-axe's hash8). */
export async function hash8(kind: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kind}\n${key}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
}

/** Text from outside (a page, the user, a model) made safe in a heading or a
 * line: line breaks become spaces, and Markdown's marks get a backslash. */
export function escapeText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").replace(/[\\`*_\[\]<>#|]/g, (c) => "\\" + c);
}
