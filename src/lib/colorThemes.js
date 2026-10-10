// Palettes only: no theme changes geometry, typography, or media colors.
export const COLOR_THEMES = [
  { id: 'original', name: 'Fastlynox', description: 'Klasik gece mavisi', bg: '#0b0e14', sidebar: '#06080c', panel: '#0a0d12', surface: '#131822', accent: '#7185ff', secondary: '#06b6d4' },
  { id: 'midnight', name: 'Midnight', description: 'Derin lacivert · elektrik mavisi', bg: '#080e1c', sidebar: '#070b16', panel: '#111b30', surface: '#1d2c49', accent: '#618cff', secondary: '#66d6e8' },
  { id: 'nord', name: 'Nord', description: 'Kutup mavisi · buz turkuazı', bg: '#242b38', sidebar: '#202631', panel: '#2e3748', surface: '#3b475d', accent: '#88c0d0', secondary: '#a3be8c' },
  { id: 'mocha', name: 'Mocha', description: 'Yumuşak mor · pastel şeftali', bg: '#1e1e2e', sidebar: '#181825', panel: '#262638', surface: '#36364e', accent: '#cba6f7', secondary: '#fab387' },
  { id: 'dracula', name: 'Dracula', description: 'Koyu füme · mor ve pembe', bg: '#22232e', sidebar: '#191a24', panel: '#2c2d3c', surface: '#3c3e53', accent: '#bd93f9', secondary: '#ff79c6' },
  { id: 'forest', name: 'Forest', description: 'Orman yeşili · nane', bg: '#0d1713', sidebar: '#09120e', panel: '#17261e', surface: '#253a2e', accent: '#68c99a', secondary: '#d6bc7c' },
  { id: 'ocean', name: 'Ocean', description: 'Petrol mavisi · mercan', bg: '#09191e', sidebar: '#071217', panel: '#102a32', surface: '#1a3d46', accent: '#55c9cc', secondary: '#f39c89' },
  { id: 'sunset', name: 'Sunset', description: 'Gece eriği · sıcak turuncu', bg: '#1b1420', sidebar: '#140f18', panel: '#2b1f2e', surface: '#402d40', accent: '#efab78', secondary: '#df8cb9' },
  { id: 'rose', name: 'Rose Garden', description: 'Gül kurusu · pastel pembe', bg: '#1e141b', sidebar: '#160e14', panel: '#2d2029', surface: '#42303c', accent: '#e59ab6', secondary: '#c3abd9' },
  { id: 'coffee', name: 'Coffee', description: 'Espresso · karamel', bg: '#1b1714', sidebar: '#13110f', panel: '#2a231e', surface: '#3e332b', accent: '#d9ac78', secondary: '#b8c79b' },
  { id: 'graphite', name: 'Graphite', description: 'Antrasit · gümüş', bg: '#141516', sidebar: '#0d0e0f', panel: '#202224', surface: '#303336', accent: '#acb7c6', secondary: '#89afb1' },
];

export const getColorTheme = (id) => COLOR_THEMES.find((theme) => theme.id === id) || COLOR_THEMES[0];
const mix = (hex, target, weight) => {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16));
  return `#${channels.map((value) => Math.round(value + (target - value) * weight).toString(16).padStart(2, '0')).join('')}`;
};
const foreground = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return r * .2126 + g * .7152 + b * .0722 > .179 ? '#0b0e14' : '#ffffff';
};

export function themeVariables(themeId, accent) {
  const theme = getColorTheme(themeId);
  const main = accent || theme.accent;
  const shades = [mix(main, 255, .85), mix(main, 255, .7), mix(main, 255, .5), mix(main, 255, .25), main, mix(main, 0, .18), mix(main, 0, .35), mix(main, 0, .5), mix(main, 0, .65)];
  return {
    '--color-fastcord-bg': theme.bg,
    '--color-fastcord-sidebar': theme.sidebar,
    '--color-fastcord-panel': theme.panel,
    '--color-fastcord-titlebar': theme.sidebar,
    '--color-fastcord-hover': theme.surface,
    '--color-fastcord-violet': main,
    '--color-fastcord-cyan': theme.secondary,
    '--theme-bg': theme.bg, '--theme-sidebar': theme.sidebar,
    '--theme-panel': theme.panel, '--theme-surface': theme.surface,
    '--theme-accent': main, '--theme-secondary': theme.secondary,
    '--theme-button-text': foreground(main),
    ...Object.fromEntries(shades.map((value, index) => [`--color-violet-${(index + 1) * 100}`, value])),
  };
}
