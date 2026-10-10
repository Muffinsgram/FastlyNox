import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_THEMES, getColorTheme, themeVariables } from '../src/lib/colorThemes.js';
import { applyAppPreferences, getAppPreferences, saveAppPreferences } from '../src/lib/appPreferences.js';

test('all theme values are colors and theme rules cannot change layout', () => {
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
    applyAppPreferences({ colorTheme: 'coffee', accentTheme: 'cyan' });
    assert.equal(properties.get('--color-fastcord-bg'), getColorTheme('coffee').bg);
    assert.equal(properties.get('--color-violet-500'), '#06b6d4');
    applyAppPreferences({ colorTheme: 'original', accentTheme: 'auto' });
    assert.equal(root.dataset.colorTheme, 'original');
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
  saveAppPreferences('alice', { ...before, colorTheme: 'nord', accentTheme: 'auto' }, storage);
  const after = getAppPreferences('alice', storage);
  assert.equal(after.colorTheme, 'nord');
  assert.equal(after.accentTheme, 'auto');
  assert.equal(after.chatDensity, before.chatDensity);
  assert.equal(after.reduceMotion, before.reduceMotion);
  assert.equal(getAppPreferences('bob', storage).colorTheme, 'original');
});
