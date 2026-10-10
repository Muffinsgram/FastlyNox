import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_THEMES, SURFACE_STYLES, getColorTheme, getSurfaceStyle, surfaceVariables, themeVariables } from '../src/lib/colorThemes.js';
import { readFile } from 'node:fs/promises';
import { applyAppPreferences, getAppPreferences, saveAppPreferences } from '../src/lib/appPreferences.js';

test('all palettes contain valid colors and unique identities', () => {
  assert.equal(new Set(COLOR_THEMES.map((theme) => theme.id)).size, COLOR_THEMES.length);
  for (const theme of COLOR_THEMES) {
    const variables = themeVariables(theme.id);
    for (const value of Object.values(variables)) assert.match(value, /^#[a-f\d]{6}$/i);
    assert.equal(variables['--color-fastcord-bg'], theme.bg);
    assert.equal(variables['--color-violet-500'], theme.accent);
  }
  assert.equal(getColorTheme('missing').id, 'original');
});

test('changing theme restores every palette value; old accent choices still work', () => {
  const previous = globalThis.document;
  const properties = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) }, classList: { toggle() {} } };
  globalThis.document = { documentElement: root };
  try {
    applyAppPreferences({ colorTheme: 'forest', accentTheme: 'auto' });
    assert.equal(root.dataset.colorTheme, 'forest');
    assert.equal(properties.get('--color-violet-500'), getColorTheme('forest').accent);
    applyAppPreferences({ colorTheme: 'aurora', accentTheme: 'auto' });
    assert.equal(root.dataset.surfaceStyle, 'glass');
    assert.equal(properties.get('--theme-blur'), '12px');
    applyAppPreferences({ colorTheme: 'aurora', accentTheme: 'auto', surfaceStyle: 'sharp' });
    assert.equal(root.dataset.surfaceStyle, 'sharp');
    assert.equal(properties.get('--theme-radius'), '8px');
    assert.equal(properties.get('--theme-blur'), '0px');
    applyAppPreferences({ colorTheme: 'coffee', accentTheme: 'cyan' });
    assert.equal(properties.get('--color-fastcord-bg'), getColorTheme('coffee').bg);
    assert.equal(properties.get('--color-violet-500'), '#06b6d4');
    applyAppPreferences({ colorTheme: 'original', accentTheme: 'auto' });
    assert.equal(root.dataset.colorTheme, 'original');
    assert.equal(root.dataset.surfaceStyle, 'classic');
    assert.equal(properties.get('--theme-radius'), '22px');
    assert.equal(properties.get('--color-fastcord-bg'), '#0b0e14');
    assert.equal(properties.get('--color-violet-200'), '#dbe2ff');
    applyAppPreferences({ colorTheme: 'unknown', accentTheme: 'unknown' });
    assert.equal(root.dataset.colorTheme, 'original');
  } finally { globalThis.document = previous; }
});

test('selected color theme persists per account without changing density or motion preferences', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const before = getAppPreferences('alice', storage);
  saveAppPreferences('alice', { ...before, colorTheme: 'nord', accentTheme: 'auto', surfaceStyle: 'outline' }, storage);
  const after = getAppPreferences('alice', storage);
  assert.equal(after.colorTheme, 'nord');
  assert.equal(after.accentTheme, 'auto');
  assert.equal(after.surfaceStyle, 'outline');
  assert.equal(after.chatDensity, before.chatDensity);
  assert.equal(after.reduceMotion, before.reduceMotion);
  assert.equal(getAppPreferences('bob', storage).colorTheme, 'original');
});

test('every theme has a bounded surface style and invalid saved choices fall back safely', () => {
  assert.equal(COLOR_THEMES.length, 24);
  for (const theme of COLOR_THEMES) {
    const style = getSurfaceStyle(theme.id);
    assert.ok(SURFACE_STYLES.includes(style));
    assert.ok(style.radius >= 8 && style.radius <= 28);
    assert.ok(style.blur >= 0 && style.blur <= 22);
    assert.match(surfaceVariables(style)['--theme-radius'], /^\d+px$/);
  }
  assert.equal(getSurfaceStyle('missing', 'invalid').id, 'classic');
  assert.equal(getSurfaceStyle('sakura').id, 'soft');
  assert.equal(getSurfaceStyle('sakura', 'outline').id, 'outline');
});

test('theme stylesheet cannot change media layout, dimensions or scale', async () => {
  const css = await readFile(new URL('../src/colorThemes.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:position|inset|top|left|right|bottom|width|height|min-width|min-height|max-width|max-height|display|transform|aspect-ratio|padding|margin|overflow)\s*:/m);
  assert.match(css, /screen-share-card:not\(:fullscreen\)/);
});
