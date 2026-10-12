// A chat message's Markdown as HTML for the site. Chats quote web pages, so
// nothing in one can become markup: raw HTML is shown as text, links go only
// to web addresses, and images aren't loaded.

import { Marked, type Tokens } from "marked";

export function escapeHtml(text: string): string {
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
