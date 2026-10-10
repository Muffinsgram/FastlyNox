function isExternalLink(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? Boolean(url.hostname) : url.protocol === 'mailto:';
  } catch { return false; }
}

module.exports = { isExternalLink };
