import { afterEach, expect, spyOn, test } from "bun:test";
import { mergeRows } from "../src/remote/messages.ts";
import { visiblePoll } from "../src/remote/poll.ts";

test("history cannot roll a newer approval or message backward", () => {
  const latest = { id: "approval", updated_at: "2026-10-19T18:00:02Z", status: "closed" };
  const stale = { ...latest, updated_at: "2026-10-19T18:00:01Z", status: "pending" };
  expect(mergeRows([latest], [stale])).toEqual([latest]);
  expect(mergeRows([stale], [latest])).toEqual([latest]);
  const other = { ...latest, id: "other" };
  expect(mergeRows([latest], [latest, other])).toEqual([latest, other]);
});

class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  visibility(value: DocumentVisibilityState) {
    this.visibilityState = value;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

const timers = new Map<number, () => void>();
let stop: (() => void) | undefined;
let restore: (() => void) | undefined;
afterEach(() => { stop?.(); restore?.(); timers.clear(); });

function clock() {
  let next = 0;
  const set = spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    timers.set(++next, fn);
    return next;
  }) as typeof setTimeout);
  const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) => { timers.delete(id); }) as typeof clearTimeout);
  restore = () => { set.mockRestore(); clear.mockRestore(); };
  return () => {
    const ready = [...timers.values()];
    timers.clear();
    ready.forEach(fn => fn());
  };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("polls pause while hidden, resume on return, and stop permanently on disposal", async () => {
  const tick = clock();
  const page = new Page();
  let calls = 0;
  const poll = visiblePoll(async () => { calls++; }, 5000, page);
  stop = poll.stop;
  await flush();
  expect(calls).toBe(1);
  page.visibility("hidden");
  tick();
  await poll.refresh();
  expect(calls).toBe(1);
  page.visibility("visible");
  await flush();
  expect(calls).toBe(2);
  tick();
  await flush();
  expect(calls).toBe(3);
  poll.stop();
  page.visibility("visible");
  tick();
  await poll.refresh();
  expect(calls).toBe(3);
  expect(timers.size).toBe(0);
});

test("a slow request never overlaps another; repeated refreshes coalesce", async () => {
  const tick = clock();
  const page = new Page();
  let finish!: () => void;
  let calls = 0;
  const poll = visiblePoll(() => { calls++; return new Promise<void>(resolve => { finish = resolve; }); }, 5000, page);
  stop = poll.stop;
  await poll.refresh();
  await poll.refresh();
  expect(calls).toBe(1);
  expect(timers.size).toBe(0);
  finish();
  await flush();
  tick();
  expect(calls).toBe(2);
  poll.stop();
  finish();
  await flush();
  expect(timers.size).toBe(0);
});

test("a request that finishes after hiding the page does not schedule a poll", async () => {
  clock();
  const page = new Page();
  let finish!: () => void;
  const poll = visiblePoll(() => new Promise<void>(resolve => { finish = resolve; }), 5000, page);
  stop = poll.stop;
  page.visibility("hidden");
  finish();
  await flush();
  expect(timers.size).toBe(0);
});
