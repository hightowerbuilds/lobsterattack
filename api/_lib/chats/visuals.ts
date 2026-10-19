// Visual replies travel in the existing saved Markdown body. SVG is NEVER
// injected as live DOM: both thumbnail and viewer use an <img> data URL.
// Image contexts disable scripts and external resources. The checks below
// reject active/external content too; they are not an HTML sanitizer.
export const MAX_SVG_CHARS = 16000;
export const CARD_KINDS = ["idea", "comparison", "plan", "decision", "question"] as const;
export type DiscussionCard = { title: string; body: string; bullets: string[]; kind: typeof CARD_KINDS[number] };
export type Drawing = { src: string; title: string };

export function drawing(source: string): Drawing | null {
  let svg = source.trim();
  if (svg.length > MAX_SVG_CHARS || !/^<svg[\s>]/.test(svg) || !/<\/svg>\s*$/.test(svg)) return null;
  if (/<(?:script|foreignObject|iframe|object|embed|audio|video|animate\w*|set)\b/i.test(svg) ||
      /<!|<\?|[\s/]on[\w:-]+\s*=/i.test(svg) || /@import/i.test(svg)) return null;
  if (/\b(?:href|src)\s*=\s*(?:"(?!#)|'(?!#)|[^\s"'#])/i.test(svg) ||
      /url\(\s*["']?(?!#)[^\s"')]/i.test(svg)) return null;
  const root = svg.match(/^<svg\b[^>]*>/)?.[0];
  if (!root) return null;
  const dimension = (name: string) => {
    const value = root.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([0-9.]+)(?:px)?["']`))?.[1];
    const number = Number(value);
    return Number.isFinite(number) && number > 0 && number <= 8192 ? number : null;
  };
  let normalized = root;
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0 || parts[2] > 8192 || parts[3] > 8192) return null;
    if (!dimension("width")) normalized = normalized.replace(/\swidth\s*=\s*(["']).*?\1/, "").replace(/>$/, ` width="${parts[2]}">`);
    if (!dimension("height")) normalized = normalized.replace(/\sheight\s*=\s*(["']).*?\1/, "").replace(/>$/, ` height="${parts[3]}">`);
  } else {
    const width = dimension("width"), height = dimension("height");
    if (!width || !height) return null;
    normalized = normalized.replace(/>$/, ` viewBox="0 0 ${width} ${height}">`);
  }
  const namespace = root.match(/\sxmlns\s*=\s*(["'])(.*?)\1/);
  if (namespace && namespace[2] !== "http://www.w3.org/2000/svg") return null;
  if (!namespace) normalized = normalized.replace(/>$/, ' xmlns="http://www.w3.org/2000/svg">');
  svg = normalized + svg.slice(root.length);
  const title = svg.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/)?.[1].replace(/<[^>]*>/g, "").trim().slice(0, 160) || "Agent drawing";
  try { return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, title }; }
  catch { return null; }
}

export function discussionCard(value: unknown): DiscussionCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const card = value as Record<string, unknown>;
  if (typeof card.title !== "string" || !card.title.trim() || card.title.length > 160) return null;
  if (card.body !== undefined && (typeof card.body !== "string" || card.body.length > 6000)) return null;
  if (card.bullets !== undefined && (!Array.isArray(card.bullets) || card.bullets.length > 12 || card.bullets.some(b => typeof b !== "string" || b.length > 600))) return null;
  if (card.kind !== undefined && !CARD_KINDS.includes(card.kind as DiscussionCard["kind"])) return null;
  const body = (card.body as string | undefined)?.trim() ?? "";
  const bullets = ((card.bullets as string[] | undefined) ?? []).map(b => b.trim()).filter(Boolean);
  if (!body && !bullets.length) return null;
  return { title: card.title.trim(), body, bullets, kind: (card.kind as DiscussionCard["kind"]) ?? "idea" };
}

export const VISUAL_GUIDE = [
  "LobsterAttack renders visual replies from both BusterClaw and Tiny Axe. Use them when they help explain a problem, compare options, or make a decision.",
  "To draw an image, emit a fenced svg block with one complete self-contained SVG. Include xmlns=\"http://www.w3.org/2000/svg\", a viewBox, and a short <title>. Use a readable background, large labels, and presentation attributes. No scripts, event handlers, foreignObject, animations, external links/resources, or CSS imports. Keep each SVG below 16,000 characters and the entire reply below 20,000 characters. The site displays it as a tappable image with a full-size viewer; do not describe it as a file on your computer.",
  '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180"><title>Plan, build, review</title><rect width="600" height="180" fill="#fff8eb"/><text x="30" y="100" font-family="sans-serif" font-size="32" fill="#183c2b">Plan → Build → Review</text></svg>\n```',
  "To create a discussion card, emit a fenced card block containing JSON with title and body and/or bullets. Optional kind: idea, comparison, plan, decision, question. Use plain text in the fields. A card is explanatory content, not a button or an approval request. Maximum: 160-character title, 6,000-character body, 12 bullets of 600 characters each.",
  '```card\n{"kind":"decision","title":"Start small","body":"Test one complete path before expanding.","bullets":["Build a working example","Review it together"]}\n```',
  "You can mix prose, drawings and cards in the same answer. Finish every code fence. These are model-authored vector drawings and discussion cards, not an external image-generation service or photo generator. The visual_create tool validates a drawing/card and returns the block to include in your reply.",
].join("\n\n");
