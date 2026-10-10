export const WEB_LINK_PATTERN = String.raw`(?:https?://|www\.)[^\s<>"'\x60]+`;

export function parseMessageLink(text) {
  let label = text;
  let suffix = '';
  // Sentence punctuation isn't part of the address; balanced URL brackets are.
  while (label) {
    const last = label.at(-1);
    const opener = { ')': '(', ']': '[', '}': '{' }[last];
    const unbalanced = opener && label.split(last).length > label.split(opener).length;
    if (!/[.,!;:]$/.test(label) && !unbalanced) break;
    suffix = last + suffix;
    label = label.slice(0, -1);
  }
  try {
    const url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    return { href: url.href, label, suffix };
  } catch { return null; }
}
