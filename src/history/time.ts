// Times are kept in UTC and shown in the browser's own time and language.

const local = (iso: string, options: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, options);
};
export const day = (iso: string) => local(iso, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
export const clock = (iso: string) => local(iso, { hour: "numeric", minute: "2-digit" });
export const when = (iso: string) =>
  local(iso, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
export const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
