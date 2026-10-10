// Decorative SVG backgrounds only: content and hit areas are never clipped.
export function surfaceArtwork(id, theme) {
  const { panel, accent, secondary } = theme;
  const heart = 'M160 20 C125 -5 28 -4 9 33 C-9 70 12 96 62 97 L258 97 C308 96 329 70 311 33 C292 -4 195 -5 160 20Z';
  let body;
  if (id === 'folded-paper') {
    body = `<path d="M3 26 L47 3 L103 15 L160 5 L217 15 L273 3 L317 26 L317 74 L281 97 L39 97 L3 74Z" fill="${panel}" stroke="${accent}" stroke-opacity=".5"/><g stroke="${accent}" stroke-opacity=".25"><path d="M3 26L47 3L77 52L103 15L160 98L217 15L243 52L273 3L317 26" fill="none"/><path d="M3 26L77 52L39 97Z" fill="${accent}" fill-opacity=".15"/><path d="M317 26L243 52L281 97Z" fill="${secondary}" fill-opacity=".16"/><path d="M47 3L103 15L77 52Z M217 15L273 3L243 52Z" fill="${accent}" fill-opacity=".2"/></g>`;
  } else if (id.startsWith('heart-') || id === 'sweetheart' || id === 'comic-heart') {
    const lace = id === 'heart-lace';
    const comic = id === 'comic-heart';
    const satin = id === 'heart-satin';
    const shine = id === 'heart-glass' || id === 'heart-pearl';
    body = `<defs><linearGradient id="fill" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity="${shine ? '.3' : '.12'}"/><stop offset=".48" stop-color="${panel}"/><stop offset="1" stop-color="${secondary}" stop-opacity=".18"/></linearGradient><linearGradient id="shine" x2="1" y2="1"><stop stop-color="white" stop-opacity=".2"/><stop offset=".35" stop-color="white" stop-opacity="0"/><stop offset=".6" stop-color="white" stop-opacity=".11"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".7" fill="${accent}" opacity=".25"/></pattern></defs>`;
    if (lace) body += `<path d="${heart}" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="6" stroke-dasharray="1 7" stroke-linecap="round"/>`;
    body += `<path d="${heart}" fill="${panel}"/><path d="${heart}" fill="url(#fill)" stroke="${accent}" stroke-opacity="${comic ? '.7' : '.3'}" stroke-width="${comic ? '2' : '1'}"/>`;
    if (shine || satin) body += `<path d="${heart}" fill="url(#shine)"/>`;
    if (id === 'heart-glass') body += `<path d="M9 33 C28 -4 125 -5 160 20 L93 97 L62 97 C12 96 -9 70 9 33Z" fill="white" opacity=".07"/>`;
    if (id === 'heart-pearl') body += `<defs><radialGradient id="pearl"><stop stop-color="white" stop-opacity=".24"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><ellipse cx="73" cy="25" rx="65" ry="33" fill="url(#pearl)"/><ellipse cx="251" cy="68" rx="58" ry="28" fill="url(#pearl)"/>`;
    if (comic) body += `<path d="${heart}" fill="url(#dots)"/>`;
  } else return 'none';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100" preserveAspectRatio="none">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
