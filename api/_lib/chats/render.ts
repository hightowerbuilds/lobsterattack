// A chat message's Markdown as HTML for the site. Chats quote web pages, so
// nothing in one can become markup: raw HTML is shown as text, links go only
// to web addresses. Explicit SVG/card fences become bounded visual replies.
// Ordinary Markdown images still do not fetch external resources.

import { Marked, type Tokens } from "marked";
import { discussionCard, drawing } from "./visuals.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const chat = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    image: ({ text }: Tokens.Image) => escapeHtml(text),
    code(token: Tokens.Code) {
      const kind = token.lang?.trim().toLowerCase();
      if (kind !== "svg" && kind !== "card") return false;
      // A streaming fence is incomplete until the matching closing delimiter.
      const opening = token.raw.match(/^ {0,3}(`{3,}|~{3,})/);
      const complete = opening && new RegExp(`\\n {0,3}${opening[1][0]}{${opening[1].length},}[ \\t]*$`).test(token.raw.trimEnd());
      if (!complete) return `<p class="visual-pending">${kind === "svg" ? "Drawing" : "Card"} is not complete yet.</p>`;
      if (kind === "svg") {
        const image = drawing(token.text);
        if (!image) return '<p class="visual-unavailable">This drawing could not be displayed. Ask the agent to redraw it.</p>';
        const title = escapeHtml(image.title), src = escapeHtml(image.src);
        return `<figure class="visual-card" aria-label="${title}"><button type="button" class="visual-preview" data-visual-src="${src}" data-visual-title="${title}" aria-label="Open full image: ${title}"><img src="${src}" alt="${title}" loading="lazy"/><span class="visual-caption"><strong>${title}</strong><span class="visual-action">View full image ↗</span></span></button></figure>`;
      }
      let value: unknown;
      try { value = JSON.parse(token.text); } catch { /* Invalid cards stay inert. */ }
      const card = discussionCard(value);
      if (!card) return '<p class="visual-unavailable">This card could not be displayed. Ask the agent to recreate it.</p>';
      const bullets = card.bullets.length ? `<ul>${card.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "";
      return `<article class="discussion-card" aria-label="${escapeHtml(card.title)}"><span class="discussion-kind">${card.kind}</span><h3>${escapeHtml(card.title)}</h3>${card.body ? `<p class="discussion-copy">${escapeHtml(card.body)}</p>` : ""}${bullets}</article>`;
    },
    link(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, { href, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:)/i.test(href)) return text;
      return `<a class="external" href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${text}</a>`;
    },
  },
});

/** A chat message, its line breaks kept as the chat showed them. */
export function renderChat(markdown: string): string {
  return chat.parse(markdown, { async: false }) as string;
}
