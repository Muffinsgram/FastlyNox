export function getClipboardImage(clipboardData) {
  for (const item of Array.from(clipboardData?.items || [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return Array.from(clipboardData?.files || []).find(file => file.type.startsWith('image/')) || null;
}
