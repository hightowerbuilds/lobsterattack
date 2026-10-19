/** One request at a time, paused in hidden tabs, refreshed on return. */
export function visiblePoll(task: () => Promise<void>, delay: number, page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document) {
  let stopped = false;
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function refresh() {
    clearTimeout(timer);
    if (stopped || page.visibilityState !== "visible") return;
    if (running) { again = true; return; }
    running = true;
    try {
      await task(); // The caller reports failures to its own UI.
    } finally {
      running = false;
      if (!stopped && page.visibilityState === "visible") {
        timer = setTimeout(() => { void refresh(); }, again ? 0 : delay);
      }
      again = false;
    }
  }

  const visibility = () => { clearTimeout(timer); void refresh(); };
  page.addEventListener("visibilitychange", visibility);
  void refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      page.removeEventListener("visibilitychange", visibility);
    },
  };
}
