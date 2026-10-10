// Themes style surfaces without changing room dimensions or media colors.
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
  { id: 'aurora', name: 'Aurora', description: 'Kutup ışıkları · cam yüzeyler', style: 'glass', bg: '#091619', sidebar: '#071013', panel: '#122a2e', surface: '#204148', accent: '#7ee7c8', secondary: '#bb9df5' },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon pembe · elektrik sarısı', style: 'sharp', bg: '#100d1b', sidebar: '#090712', panel: '#21172e', surface: '#362542', accent: '#f579d0', secondary: '#f1db74' },
  { id: 'tokyo', name: 'Tokyo Night', description: 'Gece şehri · neon mavi', style: 'sharp', bg: '#161620', sidebar: '#101019', panel: '#202131', surface: '#303247', accent: '#7aa2f7', secondary: '#bb9af7' },
  { id: 'sakura', name: 'Sakura', description: 'Kiraz çiçeği · yumuşak kartlar', style: 'soft', bg: '#201520', sidebar: '#180f19', panel: '#332238', surface: '#4b3450', accent: '#f2b3d1', secondary: '#b6c8f3' },
  { id: 'lavender', name: 'Lavender Dream', description: 'Lavanta · kadife moru', style: 'soft', bg: '#201b2b', sidebar: '#171320', panel: '#30273e', surface: '#473957', accent: '#c6b5ed', secondary: '#e4aec3' },
  { id: 'terminal', name: 'Terminal', description: 'Fosfor yeşili · keskin çizgiler', style: 'outline', bg: '#080e0a', sidebar: '#050906', panel: '#101c13', surface: '#1d3022', accent: '#8add8a', secondary: '#c7d999' },
  { id: 'ember', name: 'Ember', description: 'Volkan kömürü · bakır', style: 'outline', bg: '#1a1110', sidebar: '#110b0a', panel: '#2b1b18', surface: '#432a22', accent: '#ef986f', secondary: '#e5c28b' },
  { id: 'deep-space', name: 'Deep Space', description: 'Uzay · mavi ve ametist', style: 'glass', bg: '#090a17', sidebar: '#050611', panel: '#14162c', surface: '#252a48', accent: '#9eabff', secondary: '#d69be6' },
  { id: 'lagoon', name: 'Lagoon', description: 'Tropik turkuaz · yumuşak köşeler', style: 'soft', bg: '#101c1d', sidebar: '#0a1415', panel: '#193033', surface: '#29474a', accent: '#90ddd0', secondary: '#edca91' },
  { id: 'vinyl', name: 'Vinyl', description: 'Plak siyahı · retro altın', style: 'sharp', bg: '#171512', sidebar: '#0d0c0a', panel: '#26221b', surface: '#3a3326', accent: '#e1c47d', secondary: '#cf8b75' },
  { id: 'blueprint', name: 'Blueprint', description: 'Teknik mavi · ince çerçeveler', style: 'outline', bg: '#0d162a', sidebar: '#080f20', panel: '#172640', surface: '#253c5b', accent: '#91cafa', secondary: '#a8e2df' },
  { id: 'obsidian', name: 'Obsidian', description: 'Siyah taş · sade yüzeyler', style: 'sharp', bg: '#08090b', sidebar: '#040507', panel: '#121519', surface: '#22272e', accent: '#bcc7d6', secondary: '#849cc4' },
  { id: 'cherry', name: 'Cherry Noir', description: 'Vişne · dumanlı cam', style: 'glass', bg: '#1a0e15', sidebar: '#11090e', panel: '#2d1724', surface: '#442438', accent: '#e98fad', secondary: '#c4a8d7' },
];

export const SURFACE_STYLES = [
  { id: 'classic', name: 'Klasik', radius: 22, blur: 22, shadow: '0 18px 50px rgba(0,0,0,.18)' },
  { id: 'soft', name: 'Yumuşak', radius: 28, blur: 0, shadow: '0 12px 32px rgba(0,0,0,.22)' },
  { id: 'glass', name: 'Cam', radius: 24, blur: 12, shadow: '0 12px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.09)' },
  { id: 'sharp', name: 'Düz ve köşeli', radius: 8, blur: 0, shadow: 'none' },
  { id: 'outline', name: 'Çerçeveli', radius: 12, blur: 0, shadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 20%, transparent)' },
];

export function getSurfaceStyle(themeId, override = 'auto') {
  const id = override === 'auto' ? getColorTheme(themeId).style : override;
  return SURFACE_STYLES.find((style) => style.id === id) || SURFACE_STYLES[0];
}

export function surfaceVariables(style) {
  return { '--theme-radius': `${style.radius}px`, '--theme-blur': `${style.blur}px`, '--theme-shadow': style.shadow };
}

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
