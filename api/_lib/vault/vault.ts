// A vault as the site holds it: every note, its links and what links to it,
// built from the stored rows rather than a folder (tiny-axe's graph/src/vault.ts
// reads the same thing from disk).

import { FOLDERS, SCHEMA, links, parseNote, type Value } from "./format.js";

export interface VaultNote {
  id: string;
  kind: string;
  folder: string;
  title: string;
  trust: string;
  props: [string, Value][];
  body: string;
  /** Basenames this note links to, without repeats or itself. */
  links: string[];
}

export interface Vault {
  manifest: Record<string, unknown>;
  /** By basename, in name order. */
  notes: Map<string, VaultNote>;
  /** Basename → the notes that link to it. */
  backlinks: Map<string, string[]>;
  /** A note's key (`shop.example`, a task id, ...) → its basename. */
  byKey: Map<string, string>;
}

export interface GraphNode {
  id: string;
  kind: string;
  title: string;
  folder: string;
  trust: string;
  seen: number | null;
}

export interface Graph {
  schema: string;
  nodes: GraphNode[];
  links: { source: string; target: string }[];
  /** Links to notes that aren't there, as `{source, target}`. */
  unresolved: { source: string; target: string }[];
}

/** A note file as tiny-axe sends it: its folder, its basename and its text. */
export interface NoteFile {
  folder: string;
  id: string;
  text: string;
}

const KNOWN_FOLDERS = new Set(Object.values(FOLDERS));

// What a vault's basename may be: no folders, no dot files, nothing that
// would make a strange URL. tiny-axe's slugs are letters, digits, `.`, `_`,
// `-` and a space before the hash.
const BASENAME = /^[A-Za-z0-9_][A-Za-z0-9._ -]{0,99}$/;

/** Reads one note file. Throws, saying why, on one that isn't a vault note. */
export function readNote(file: NoteFile): VaultNote {
  if (!KNOWN_FOLDERS.has(file.folder)) throw new Error(`unknown folder ${JSON.stringify(file.folder)}`);
  if (!BASENAME.test(file.id)) throw new Error(`bad note name ${JSON.stringify(file.id)}`);
  const note = parseNote(file.text);
  const props = Object.fromEntries(note.props) as Record<string, Value>;
  if (typeof props.kind !== "string" || typeof props.title !== "string") {
    throw new Error(`${file.id}: a note needs a kind and a title`);
  }
  return {
    id: file.id,
    kind: props.kind,
    folder: file.folder,
    title: props.title,
    trust: String(props.trust),
    props: note.props,
    body: note.body,
    links: [...new Set(links(note.body))].filter((target) => target !== file.id),
  };
}

export function buildVault(manifest: Record<string, unknown>, found: VaultNote[]): Vault {
  const sorted = [...found].sort((a, b) => compare(a.id, b.id));
  const notes = new Map(sorted.map((n) => [n.id, n]));
  const backlinks = new Map<string, string[]>();
  const byKey = new Map<string, string>();

  for (const note of sorted) {
    const key = note.props.find(([name]) => name === "key")?.[1];
    if (typeof key === "string") byKey.set(key, note.id);
    for (const target of note.links) {
      if (!backlinks.has(target)) backlinks.set(target, []);
      backlinks.get(target)!.push(note.id);
    }
  }

  return { manifest: { schema: SCHEMA, ...manifest }, notes, backlinks, byKey };
}

export function toGraph(vault: Vault): Graph {
  const nodes: GraphNode[] = [];
  const linked: { source: string; target: string }[] = [];
  const unresolved: { source: string; target: string }[] = [];

  for (const note of vault.notes.values()) {
    const seen = note.props.find(([name]) => name === "seen")?.[1];
    nodes.push({
      id: note.id,
      kind: note.kind,
      title: note.title,
      folder: note.folder,
      trust: note.trust,
      seen: typeof seen === "number" ? seen : null,
    });

    for (const target of [...note.links].sort(compare)) {
      (vault.notes.has(target) ? linked : unresolved).push({ source: note.id, target });
    }
  }

  return { schema: SCHEMA, nodes, links: linked, unresolved };
}

// Plain string order, as Elixir sorts (note names are ASCII; localeCompare
// would depend on the locale).
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
