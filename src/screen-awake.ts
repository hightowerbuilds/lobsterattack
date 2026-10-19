// The browser can release a wake lock at any time. Never report "awake"
// until a live sentinel exists, and release even a late request after exit.
export type AwakeState = "off" | "requesting" | "awake" | "unavailable";
type Lock = Pick<WakeLockSentinel, "released" | "release" | "addEventListener">;

export function screenAwake(
  request: (() => Promise<Lock>) | undefined,
  changed: (state: AwakeState) => void,
) {
  let wanted = false;
  let visible = true;
  let generation = 0;
  let lock: Lock | undefined;

  const release = () => {
    generation++;
    const previous = lock;
    lock = undefined;
    if (previous) void previous.release().catch(() => {});
  };
  const acquire = async () => {
    release();
    if (!wanted || !visible) return;
    if (!request) { changed("unavailable"); return; }
    const attempt = generation;
    changed("requesting");
    try {
      const next = await request();
      if (attempt !== generation || !wanted || !visible) {
        void next.release().catch(() => {});
        return;
      }
      lock = next;
      changed(next.released ? "unavailable" : "awake");
      next.addEventListener("release", () => {
        if (lock !== next) return;
        lock = undefined;
        changed(wanted && visible ? "unavailable" : "off");
      }, { once: true });
    } catch {
      if (attempt === generation && wanted && visible) changed("unavailable");
    }
  };
  return {
    start() { wanted = true; void acquire(); },
    stop() { wanted = false; release(); changed("off"); },
    visibility(showing: boolean) {
      visible = showing;
      if (!showing) { release(); changed("off"); }
      else if (wanted) void acquire();
    },
  };
}
