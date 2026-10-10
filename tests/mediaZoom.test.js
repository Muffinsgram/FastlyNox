import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomMedia, clampMediaPan } from '../src/lib/mediaZoom.js';

test('zoom keeps the pointed part of the media anchored', () => {
  const result = zoomMedia({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 }, { width: 800, height: 600 });
  assert.deepEqual(result, { scale: 2, x: -100, y: -50 });
});
test('zoom is bounded and returning to normal size resets pan', () => {
  assert.deepEqual(zoomMedia({ scale: 2, x: -100, y: 50 }, 0.5, { x: 0, y: 0 }, { width: 800, height: 600 }), { scale: 1, x: 0, y: 0 });
  assert.equal(zoomMedia({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, { width: 800, height: 600 }).scale, 5);
});
test('dragging cannot move zoomed media entirely out of the viewport', () => {
  assert.deepEqual(clampMediaPan({ scale: 2, x: 5000, y: -5000 }, { width: 800, height: 600 }), { scale: 2, x: 400, y: -300 });
});
