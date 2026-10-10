export function zoomMedia(view, scale, point, size) {
  const nextScale = Math.max(1, Math.min(5, scale));
  if (nextScale === 1) return { scale: 1, x: 0, y: 0 };
  const ratio = nextScale / view.scale;
  return clampMediaPan({ scale: nextScale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, size);
}

export function clampMediaPan(view, size) {
  const maxX = size.width * (view.scale - 1) / 2;
  const maxY = size.height * (view.scale - 1) / 2;
  return { ...view, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(-maxY, Math.min(maxY, view.y)) };
}
