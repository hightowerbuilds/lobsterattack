// The overview and a note, with the sidebar's list items. Text from notes
// always goes in as text; the only HTML inserted is a note body the server
// rendered (render.ts).

import { createEffect, createSignal, For, Match, on, Show, Switch, type JSX } from "solid-js";
import { Axe } from "./axe.tsx";
import { LocalGraph } from "./graph-page.tsx";
import {
  blocked,
  byTitle,
  chatHref,
  chatsQuery,
  graphHref,
  noteHref,
  noteQuery,
  ORDER,
  overview,
  recall,
  remember,
  route,
  searchQuery,
  sorted,
  type Entry,
  type NoteDetail,
  type Result,
  type Value,
} from "./store.ts";

export function Dot(props: { entry: { kind: string; trust: string; gate?: string | null } }) {
  return <span class={`dot ${props.entry.kind} ${props.entry.trust}${blocked(props.entry) ? " blocked" : ""}`} aria-hidden="true" />;
}

export function Item(props: { entry: Entry; children?: JSX.Element }) {
  const here = () => {
    const r = route();
    return r.kind === "note" && r.id === props.entry.id;
  };
  return (
    <a class="item" href={noteHref(props.entry.id)} title={props.entry.title} aria-current={here() ? "page" : undefined}>
      <Dot entry={props.entry} />
      <span class="label">{props.entry.title}</span>
      {props.children}
    </a>
  );
}

// Search results, searched again as the vault changes.
export function Results(props: { query: string }) {
  const results = searchQuery(() => props.query);
  return (
    <Switch>
      <Match when={results.error}>{(error) => <p class="problem">{error().message}</p>}</Match>
      <Match when={results.data?.length === 0}>
        <p class="empty">Nothing matches.</p>
      </Match>
      <Match when={results.data}>
        {(list) => (
          <ul class="results">
            <For each={list()}>
              {(r) => (
                <li>
                  <Item entry={r}>
                    <span class="where">{r.folder}</span>
                    <Show when={r.snippet}>
                      <span class="snippet">{r.snippet}</span>
                    </Show>
                  </Item>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
    </Switch>
  );
}

function List(props: { entries: Entry[]; meta: (e: Entry) => string; empty: string }) {
  return (
    <Show when={props.entries.length > 0} fallback={<p class="empty">{props.empty}</p>}>
      <ul>
        <For each={props.entries}>
          {(e) => (
            <li>
              <Item entry={e}>
                <span class="meta">{props.meta(e)}</span>
              </Item>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

/** The home page: what tiny-axe knows, in numbers and lists, and the one
 * link to the graph (which lays itself out meanwhile). */
const TABS = ["Chat", "Overview", "Sessions", "Sites", "Tasks", "Gate", "Folders", "Search"] as const;
type Tab = (typeof TABS)[number];

/** The home page: what tiny-axe knows, one tab at a time, filling the
 * window without scrolling it (a long tab scrolls within itself). The tab
 * is remembered in this browser. The graph lays itself out meanwhile. */
export function HomePage() {
  document.title = "tiny-axe know-how";
  const notes = (folder: string) => overview.folders.find((f) => f.name === folder)?.notes ?? [];
  const s = () => overview.summary!;
  const was = recall<string>("home-tab", "Chat");
  const saved = (was === "Chats" ? "Sessions" : was === "Lately" ? "Overview" : was) as Tab;
  const [tab, setTab] = createSignal<Tab>(TABS.includes(saved) ? saved : "Chat");
  const pick = (t: Tab) => {
    setTab(t);
    remember("home-tab", t);
  };

  return (
    <div class="home">
      <header class="home-head">
        <Axe />
        <a class="button open-graph" href="/graph">
          Open the graph
        </a>
      </header>
      <div class="tabs" role="tablist" aria-label="Home">
        <For each={TABS}>
          {(t) => (
            <button type="button" role="tab" aria-selected={tab() === t} onClick={() => pick(t)}>
              {t}
            </button>
          )}
        </For>
      </div>
      <div class="home-pane" role="tabpanel">
        <Switch>
          <Match when={tab() === "Overview"}>
            <p class="lede">Every site, page and decision path tiny-axe has used on the web, from its own records.</p>
            <Show when={overview.summary}>
              <div class="tiles">
                <Tile n={s().sites} what="sites" />
                <Tile n={s().pages} what="pages" />
                <Tile n={s().paths} what="decision paths" sub={s().blocked ? `${s().blocked} stopped by the gate` : undefined} />
                <Tile n={s().tools} what="tools" />
                <Tile n={s().tasks} what="tasks" />
                <Tile n={s().notes} what="notes" sub="written by the model" />
              </div>
              <p class="lede">
                {s().sites + s().pages + s().controls + s().paths + s().tools + s().tasks + s().notes} notes in the graph.
              </p>
            </Show>
            <h2>Lately</h2>
            <List entries={lately(overview.folders)} meta={(e) => e.last_seen?.slice(0, 10) ?? ""} empty="Nothing seen yet." />
          </Match>
          <Match when={tab() === "Chat"}>
            <p class="lede">Talk to tiny-axe from here. Coming: it will reach your tiny-axe wherever it's running.</p>
            <div class="chat-box" aria-label="Chat with tiny-axe">
              <div class="chat-log">
                <p class="empty">Nothing yet.</p>
              </div>
              <form class="chat-send" onSubmit={(e) => e.preventDefault()}>
                <input type="text" placeholder="Ask tiny-axe…" aria-label="Message" disabled />
                <button type="submit" class="button" disabled>
                  Send
                </button>
              </form>
            </div>
          </Match>
          <Match when={tab() === "Sessions"}>
            <RecentChats />
          </Match>
          <Match when={tab() === "Sites"}>
            <List entries={[...notes("Sites")].sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0))} meta={(e) => `${e.seen ?? 0} actions`} empty="No sites yet." />
          </Match>
          <Match when={tab() === "Tasks"}>
            <List entries={[...notes("Tasks")].sort(ORDER.Tasks)} meta={(e) => e.last_seen?.slice(0, 10) ?? ""} empty="No tasks yet." />
            <Show when={notes("Notes").length > 0}>
              <h2>Notes</h2>
              <List entries={[...notes("Notes")].sort(byTitle)} meta={() => "by the model"} empty="" />
            </Show>
          </Match>
          <Match when={tab() === "Gate"}>
            <p class="lede">Where the gate stopped tiny-axe.</p>
            <List entries={notes("Paths").filter(blocked).sort(byTitle)} meta={(e) => e.gate ?? ""} empty="Nothing stopped yet." />
          </Match>
          <Match when={tab() === "Folders"}>
            <Folders />
          </Match>
          <Match when={tab() === "Search"}>
            <SearchBox />
          </Match>
        </Switch>
      </div>
    </div>
  );
}

// The notes tiny-axe saw last, whatever their folder.
function lately(folders: { name: string; notes: Entry[] }[]) {
  return folders
    .flatMap((f) => f.notes)
    .filter((e) => e.last_seen)
    .sort((a, b) => (a.last_seen! < b.last_seen! ? 1 : -1))
    .slice(0, 30);
}

// A search box with its results under it (the sidebar has the same).
function SearchBox() {
  const [query, setQuery] = createSignal("");
  let typing: number | undefined;
  return (
    <div class="home-search">
      <input
        type="search"
        placeholder="Search notes"
        autocomplete="off"
        aria-label="Search notes"
        onInput={(e) => {
          const q = e.currentTarget.value.trim();
          clearTimeout(typing);
          typing = window.setTimeout(() => setQuery(q), 120);
        }}
      />
      <Show when={query()}>{(q) => <Results query={q()} />}</Show>
    </div>
  );
}

// The last chats, newest first, from the chat list query (shared with /chats).
function RecentChats() {
  const list = chatsQuery(() => "");
  const recent = () =>
    (list.data?.sessions ?? [])
      .flatMap((s) => s.chats)
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
      .slice(0, 20);
  return (
    <Switch>
      <Match when={list.error}>{(error) => <p class="problem">{error().message}</p>}</Match>
      <Match when={list.data && recent().length === 0}>
        <p class="empty">No chats yet.</p>
      </Match>
      <Match when={list.data}>
        <ul>
          <For each={recent()}>
            {(c) => (
              <li>
                <a class="item" href={chatHref(c.id)} title={c.title}>
                  <span class="label">{c.title || "Untitled chat"}</span>
                  <span class="meta">
                    {c.messages} messages · {c.updated.slice(0, 10)}
                  </span>
                </a>
              </li>
            )}
          </For>
        </ul>
        <p class="more">
          <a href="/chats">All sessions ({list.data!.total})</a>
        </p>
      </Match>
    </Switch>
  );
}

// Every folder, closed until opened.
function Folders() {
  return (
    <div class="folders">
      <For each={overview.folders}>
        {(folder) => (
          <details>
            <summary>
              {folder.name}
              <span class="count">{folder.notes.length}</span>
            </summary>
            <ul>
              <For each={sorted(folder.name, folder.notes)}>
                {(e) => (
                  <li>
                    <Item entry={e} />
                  </li>
                )}
              </For>
            </ul>
          </details>
        )}
      </For>
    </div>
  );
}

function Tile(props: { n: number; what: string; sub?: string }) {
  return (
    <div class="tile">
      <div class="n">{props.n}</div>
      <div class="what">{props.what}</div>
      <Show when={props.sub}>
        <div class="sub">{props.sub}</div>
      </Show>
    </div>
  );
}

/** A note, fetched again whenever tiny-axe changes it or a note linked to it. */
export function NotePage(props: { id: string }) {
  const note = noteQuery(() => props.id);
  createEffect(() => {
    if (!note.error && note.data) document.title = `${note.data.title} · tiny-axe know-how`;
  });

  return (
    <Switch>
      <Match when={note.error}>{(error) => <p class="problem">{error().message}</p>}</Match>
      <Match when={note.data}>
        {(n) => (
          <div class="note-page">
            <article class="note">
              <div class="crumbs">
                <span>{n().folder}</span>
                <a class="button" href={graphHref(n().id)}>
                  Show in graph
                </a>
              </div>
              <div class="badges">
                <span class="badge">{n().kind}</span>
                <span class={`badge trust-${n().trust}`}>{n().trust}</span>
                <Show when={n().gate}>
                  <span class={`badge${blocked(n()) ? " blocked" : ""}`}>gate: {n().gate}</span>
                </Show>
              </div>
              <Body note={n()} />
              <Show when={n().backlinks.length > 0}>
                <section class="backlinks">
                  <h2>Linked from</h2>
                  <For each={n().backlinks}>
                    {(group) => (
                      <>
                        <h3>{group.folder}</h3>
                        <ul>
                          <For each={sorted(group.folder, group.notes)}>
                            {(e) => (
                              <li>
                                <Item entry={e} />
                              </li>
                            )}
                          </For>
                        </ul>
                      </>
                    )}
                  </For>
                </section>
              </Show>
            </article>
            <LocalGraph id={props.id} />
          </div>
        )}
      </Match>
    </Switch>
  );
}

// The server's HTML for the body, with the properties under its title, as
// Obsidian shows them. The properties stay open or closed across updates.
function Body(props: { note: NoteDetail }) {
  let body!: HTMLDivElement;
  const details = (
    <details class="props">
      <summary>Properties</summary>
      <dl>
        <For each={props.note.props.filter(([name]) => !["kind", "title"].includes(name))}>
          {([name, value]) => (
            <>
              <dt>{name}</dt>
              <dd>
                <PropValue value={value} refs={props.note.refs} />
              </dd>
            </>
          )}
        </For>
      </dl>
    </details>
  ) as HTMLDetailsElement;

  createEffect(() => {
    body.innerHTML = props.note.html;
    const title = body.querySelector("h1");
    if (title) title.after(details);
    else body.prepend(details);
  });
  return <div class="body" ref={body} />;
}

function PropValue(props: { value: Value; refs: NoteDetail["refs"] }) {
  const one = (v: string) => {
    const ref = props.refs[v];
    return ref ? <a href={noteHref(ref.id)}>{ref.title}</a> : v;
  };
  return (
    <Switch fallback={<>{String(props.value)}</>}>
      <Match when={props.value === null || (Array.isArray(props.value) && props.value.length === 0)}>
        <span class="null">none</span>
      </Match>
      <Match when={Array.isArray(props.value) && props.value}>
        {(list) => (
          <span>
            <For each={list()}>{(v) => <span class="chip">{one(v)}</span>}</For>
          </span>
        )}
      </Match>
      <Match when={typeof props.value === "string" && props.value}>{(v) => one(v())}</Match>
    </Switch>
  );
}
