import { describe, expect, test } from "bun:test";
import { screenAwake, type AwakeState } from "../src/screen-awake.ts";

class Lock extends EventTarget {
  released = false;
  async release() { this.released = true; this.dispatchEvent(new Event("release")); }
}
const flush = () => new Promise<void>(resolve => queueMicrotask(resolve));

describe("mobile screen awake", () => {
  test("acquires only on request, releases on exit, and can be entered again", async () => {
    const locks: Lock[] = [];
    const states: AwakeState[] = [];
    const awake = screenAwake(async () => { const lock = new Lock(); locks.push(lock); return lock; }, state => states.push(state));
    expect(locks).toHaveLength(0);
    awake.start(); await flush();
    expect(states.at(-1)).toBe("awake");
    awake.stop();
    expect(locks[0].released).toBe(true);
    expect(states.at(-1)).toBe("off");
    awake.start(); await flush();
    expect(locks).toHaveLength(2);
    expect(locks[1].released).toBe(false);
    awake.stop();
  });

  test("releases a late grant after closing or switching away", async () => {
    let grant!: (lock: Lock) => void;
    const states: AwakeState[] = [];
    const awake = screenAwake(() => new Promise(resolve => { grant = resolve; }), state => states.push(state));
    awake.start(); awake.stop();
    const lock = new Lock(); grant(lock); await flush();
    expect(lock.released).toBe(true);
    expect(states.at(-1)).toBe("off");
  });

  test("reacquires on returning to the page, but never after exit", async () => {
    const locks: Lock[] = [];
    const awake = screenAwake(async () => { const lock = new Lock(); locks.push(lock); return lock; }, () => {});
    awake.start(); await flush();
    awake.visibility(false);
    expect(locks[0].released).toBe(true);
    awake.visibility(true); await flush();
    expect(locks).toHaveLength(2);
    awake.stop(); awake.visibility(false); awake.visibility(true); await flush();
    expect(locks).toHaveLength(2);
  });

  test("reports denied, missing and revoked wake locks honestly", async () => {
    const states: AwakeState[] = [];
    screenAwake(undefined, state => states.push(state)).start();
    expect(states.at(-1)).toBe("unavailable");
    screenAwake(async () => { throw new Error("Low Power Mode"); }, state => states.push(state)).start();
    await flush(); expect(states.at(-1)).toBe("unavailable");
    const lock = new Lock();
    const awake = screenAwake(async () => lock, state => states.push(state));
    awake.start(); await flush(); await lock.release();
    expect(states.at(-1)).toBe("unavailable");
    awake.stop();
  });

  test("a stale request cannot replace or release the current lock", async () => {
    const grants: ((lock: Lock) => void)[] = [];
    const states: AwakeState[] = [];
    const awake = screenAwake(() => new Promise(resolve => grants.push(resolve)), state => states.push(state));
    awake.start(); awake.stop(); awake.start();
    const current = new Lock(); grants[1](current); await flush();
    const stale = new Lock(); grants[0](stale); await flush();
    expect(stale.released).toBe(true);
    expect(current.released).toBe(false);
    expect(states.at(-1)).toBe("awake");
    awake.stop(); expect(current.released).toBe(true);
  });
});
