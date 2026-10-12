// A second net for what tiny-axe sends. tiny-axe redacts before anything
// leaves the machine (TinyAxe.Tools.Redact); these are the same patterns,
// run again here in case something slipped through.

// 13–19 digits, spaces or dashes allowed between them, that pass the Luhn check.
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

// 24+ letters, digits, `_` and `-`, with at least one letter and one digit.
const TOKEN = /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_-])/g;

/** Card numbers removed (TinyAxe.Tools.Redact.text/1). Safe for notes:
 * note names never hold 13 digits in a row. */
export function cards(text: string): string {
  return text.replace(CARD, (match) => (luhn(match.replace(/\D/g, "")) ? "[card number removed]" : match));
}

/** Card numbers and token-like strings removed (TinyAxe.Tools.Redact.secrets/1),
 * for chats. Not for notes: it could cut a long note name in a link. */
export function secrets(text: string): string {
  return cards(text).replace(TOKEN, "[token removed]");
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
