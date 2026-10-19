import { describe, expect, test } from "bun:test";
import { renderChat } from "../api/_lib/chats/render.ts";
import { discussionCard, drawing, MAX_SVG_CHARS, VISUAL_GUIDE } from "../api/_lib/chats/visuals.ts";

const svg = '<svg viewBox="0 0 800 400"><title>A clear plan</title><rect width="800" height="400" fill="white"/><text x="30" y="60">Plan → Build</text></svg>';
const fence = (kind: string, body: string) => `\`\`\`${kind}\n${body}\n\`\`\``;

describe("visual replies", () => {
  test("a complete drawing is a tappable image, never live SVG markup", () => {
    const html = renderChat(`Here is the plan.\n\n${fence("svg", svg)}\n\nWhat should change?`);
    expect(html).toContain('class="visual-preview"');
    expect(html).toContain('alt="A clear plan"');
    expect(html).toContain('data:image/svg+xml;');
    expect(html).not.toContain("<svg");
    expect(html).toContain("What should change?");
    const image = drawing(svg)!;
    const source = decodeURIComponent(image.src.split(",")[1]);
    expect(source).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(source).toContain('width="800" height="400"');
  });

  test("normalizes numeric dimensions and preserves internal gradient references", () => {
    const image = drawing('<svg width = "600px" height="300"><defs><linearGradient id="a"/></defs><rect fill="url(#a)" width="600" height="300"/></svg>');
    expect(image).not.toBeNull();
    expect(decodeURIComponent(image!.src)).toContain('viewBox="0 0 600 300"');
    expect(drawing('<svg viewBox="0 0 20 20"><use href="#a"/></svg>')).not.toBeNull();
  });

  test("rejects scripts, handlers, external resources and unbounded dimensions", () => {
    const bodies = [
      '<script>alert(1)</script>', '<rect onload="alert(1)"/>', '<rect/onload="alert(1)"/>',
      '<foreignObject><div>HTML</div></foreignObject>', '<use href="https://example.com/track"/>',
      '<use href="data:image/svg+xml,bad"/>', '<style>@import "https://example.com/x";</style>',
      '<rect fill="url(https://example.com/x)"/>', '<animate attributeName="href"/>',
      '<!DOCTYPE svg>', '<?xml-stylesheet href="https://example.com/x"?>',
    ];
    for (const body of bodies) expect(drawing(`<svg viewBox="0 0 800 400">${body}</svg>`)).toBeNull();
    for (const source of [
      '<svg viewBox="0 0 1e9 2"></svg>', '<svg viewBox="0 0 -1 2"></svg>',
      '<svg viewBox="0 0 NaN 2"></svg>', '<svg xmlns="https://example.com" viewBox="0 0 1 2"></svg>',
      '<svg></svg>', '<svg viewBox="0 0 10 10">', svg + 'x'.repeat(MAX_SVG_CHARS),
      '<svg viewBox="0 0 10 10"><text>\ud800</text></svg>',
    ]) expect(drawing(source)).toBeNull();
  });

  test("does not show an incomplete streamed drawing as code or a broken image", () => {
    const html = renderChat('```svg\n<svg viewBox="0 0 400 200"><rect');
    expect(html).toContain("not complete yet");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<pre");
    expect(renderChat('~~~~svg\n' + svg + '\n~~~~')).toContain('class="visual-preview"');
    expect(renderChat('```js\nalert(1)\n```')).toContain("<pre><code");
  });

  test("cards preserve discussion content and escape untrusted HTML", () => {
    const card = { kind: "comparison", title: 'A < B "choice"', body: '<script>bad()</script>', bullets: ['<img src=x onerror=bad()>', 'Second option'] };
    const html = renderChat(fence("card", JSON.stringify(card)));
    expect(html).toContain('class="discussion-card"');
    expect(html).toContain("comparison");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("Second option");
    for (const value of [null, [], {}, {title:"Empty"}, {title:"Title",body:3}, {title:"Title",bullets:[1]}, {title:"Title",body:"ok",kind:"approve"}, {title:"Title",bullets:Array(13).fill("x")}]) expect(discussionCard(value)).toBeNull();
  });

  test("invalid cards and drawings have an explicit fallback; ordinary HTML/images stay inert", () => {
    expect(renderChat(fence("card", "not JSON"))).toContain("could not be displayed");
    expect(renderChat(fence("svg", '<svg><script>bad()</script></svg>'))).not.toContain("<img");
    expect(renderChat('<img src="x" onerror="bad()">')).not.toContain('<img');
    expect(renderChat('![tracker](https://example.com/track)')).not.toContain('<img');
    expect(renderChat('[bad](javascript:alert(1))')).not.toContain('href=');
  });

  test("the published agent examples actually render", () => {
    const html = renderChat(VISUAL_GUIDE);
    expect(html).toContain('class="visual-preview"');
    expect(html).toContain('class="discussion-card"');
  });
});
