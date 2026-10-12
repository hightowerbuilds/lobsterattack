// The rules of tiny-axe's know-how vault format (tiny-axe docs/vault-format.md),
// as the site needs them. Ported from tiny-axe's graph/src/format.ts; both are
// checked against the same fixture (api/test/fixtures/vault).

export const SCHEMA = "tiny-axe-vault/1";

export type Kind = "site" | "page" | "control" | "path" | "tool" | "task" | "workflow";

export const FOLDERS: Record<Kind, string> = {
  site: "Sites",
  page: "Pages",
  control: "Controls",
  path: "Paths",
  tool: "Tools",
  task: "Tasks",
  workflow: "Workflows",
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
