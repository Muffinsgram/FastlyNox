import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const path = new URL('../src/features/chat/components/ZoomableMedia.jsx', import.meta.url);
const source = (await readFile(path, 'utf8')).replace('../../../lib/mediaZoom', new URL('../src/lib/mediaZoom.js', import.meta.url).href);
const result = await transformWithOxc(source, path.pathname, { jsx: { runtime: 'automatic' } });
const code = result.code.replace(/from ["'](react(?:\/jsx-runtime)?)["']/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { ZoomableMedia } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('stream zoom viewport fills its stage without conflicting positioning classes', () => {
  const html = renderToStaticMarkup(createElement(ZoomableMedia, { fill: true, wheelZoom: true }, createElement('video', { className: 'h-full w-full' })));
  assert.match(html, /style="position:absolute;inset:0;/);
  assert.doesNotMatch(html, /class="relative overflow-hidden/);
  assert.match(html, /<video/);
});

test('photo zoom retains a relative viewport with the caller-provided size', () => {
  const html = renderToStaticMarkup(createElement(ZoomableMedia, { clickZoom: true, className: 'h-[84vh] w-[92vw]' }, createElement('img', { src: '/photo.png' })));
  assert.match(html, /position:relative/);
  assert.match(html, /h-\[84vh\] w-\[92vw\]/);
  assert.doesNotMatch(html, /position:absolute;inset:0;touch-action/);
});
