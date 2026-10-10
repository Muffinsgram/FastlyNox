import { surfaceArtwork } from './surfaceArtwork.js';
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
  { id: 'origami', name: 'Origami', description: 'Katlanmış köşeler · mürekkep ve kayısı', style: 'asymmetric', bg: '#181e2b', sidebar: '#101521', panel: '#252f42', surface: '#34435b', accent: '#bc9471', secondary: '#719caa' },
  { id: 'river-stone', name: 'River Stone', description: 'Organik taşlar · adaçayı ve kum', style: 'pebble', bg: '#17221c', sidebar: '#101912', panel: '#25382c', surface: '#354b3b', accent: '#88ab79', secondary: '#b39b73' },
  { id: 'paper-moon', name: 'Paper Moon', description: 'Katmanlı kartlar · koyu füme', style: 'layered', bg: '#202025', sidebar: '#16161b', panel: '#2d2e36', surface: '#3d3e48', accent: '#aaa6bb', secondary: '#819bad' },
  { id: 'arcade', name: 'Arcade', description: 'Siyah zemin · neon çerçeveler', style: 'neon', bg: '#000000', sidebar: '#050506', panel: '#111014', surface: '#201c29', accent: '#946bca', secondary: '#579f94' },
  { id: 'atelier', name: 'Atelier', description: 'Çift çerçeve · koyu ceviz', style: 'double', bg: '#241a15', sidebar: '#19110e', panel: '#35261e', surface: '#473329', accent: '#b59673', secondary: '#86916d' },
  { id: 'night-ticket', name: 'Night Ticket', description: 'Bilet çizgileri · turuncu ve petrol', style: 'ticket', bg: '#13232e', sidebar: '#0d1922', panel: '#203747', surface: '#2c4a59', accent: '#b8895e', secondary: '#629da2' },
  { id: 'pop-art', name: 'Pop Art', description: 'Grafit gri · sert gölgeler', style: 'brutalist', bg: '#212226', sidebar: '#17181b', panel: '#303238', surface: '#43464e', accent: '#a2aa61', secondary: '#957cae' },
  { id: 'ribbon', name: 'Ribbon', description: 'Renk şeritleri · böğürtlen ve buz', style: 'ribbon', bg: '#281b28', sidebar: '#1b121d', panel: '#3a293d', surface: '#4b3651', accent: '#b785a5', secondary: '#72a7ae' },
];

export const SURFACE_STYLES = [
  { id: 'classic', name: 'Klasik', radius: 22, blur: 22, shadow: '0 18px 50px rgba(0,0,0,.18)' },
  { id: 'soft', name: 'Yumuşak', radius: 28, blur: 0, shadow: '0 12px 32px rgba(0,0,0,.22)' },
  { id: 'glass', name: 'Cam', radius: 24, blur: 12, shadow: '0 12px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.09)' },
  { id: 'sharp', name: 'Düz ve köşeli', radius: 8, blur: 0, shadow: 'none' },
  { id: 'outline', name: 'Çerçeveli', radius: 12, blur: 0, shadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 20%, transparent)' },
  { id: 'asymmetric', name: 'Origami', description: 'Çapraz, asimetrik köşeler', radius: 28, corners: '28px 6px 28px 6px', blur: 0, shadow: 'inset 3px 0 0 color-mix(in srgb, var(--theme-accent) 65%, transparent), 0 8px 24px rgba(0,0,0,.18)' },
  { id: 'pebble', name: 'Çakıl taşı', description: 'Organik, oval köşeler', radius: 28, corners: '28px 14px 32px 18px / 18px 28px 16px 30px', blur: 0, shadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 8px 24px rgba(0,0,0,.2)' },
  { id: 'layered', name: 'Katmanlı', description: 'Üst üste duran kartlar', radius: 16, blur: 0, shadow: '2px 2px 0 var(--theme-bg), 4px 4px 0 color-mix(in srgb, var(--theme-accent) 35%, var(--theme-panel)), 6px 6px 0 var(--theme-bg), 8px 8px 0 color-mix(in srgb, var(--theme-secondary) 22%, var(--theme-panel))' },
  { id: 'neon', name: 'Neon', description: 'Sabit ışıklı çift renk', radius: 14, blur: 0, shadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 55%, transparent), 0 0 16px color-mix(in srgb, var(--theme-accent) 13%, transparent)' },
  { id: 'double', name: 'Galeri', description: 'İç içe ince çerçeveler', radius: 18, blur: 0, shadow: 'inset 0 0 0 4px var(--theme-panel), inset 0 0 0 5px color-mix(in srgb, var(--theme-accent) 28%, transparent)' },
  { id: 'ticket', name: 'Bilet', description: 'Kesikli çizgiler, çapraz köşeler', radius: 18, corners: '6px 24px 6px 24px', blur: 0, shadow: 'inset 0 0 0 4px var(--theme-panel)' },
  { id: 'brutalist', name: 'Pop kutu', description: 'Sert gölge, grafik çerçeve', radius: 8, blur: 0, shadow: '5px 5px 0 color-mix(in srgb, var(--theme-accent) 50%, var(--theme-bg))' },
  { id: 'ribbon', name: 'Şerit', description: 'İki renkte kenar şeritleri', radius: 22, corners: '6px 22px 22px 6px', blur: 0, shadow: 'inset 4px 0 0 var(--theme-accent), inset 0 -3px 0 color-mix(in srgb, var(--theme-secondary) 55%, transparent), 0 8px 24px rgba(0,0,0,.16)' },
  { id: 'petal', name: 'Gül yaprağı', description: 'Çiçek gibi yumuşak, oval köşeler', radius: 28, corners: '28px 18px 28px 18px / 18px 28px 18px 28px', blur: 0, shadow: 'inset 0 1px 0 color-mix(in srgb, var(--theme-accent) 28%, transparent), 0 5px 18px rgba(0,0,0,.14)' },
  { id: 'pearl', name: 'İnci', description: 'İpeksi yuvarlaklık, zarif inci çerçeve', radius: 28, blur: 0, shadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 22%, transparent), inset 0 2px 4px rgba(255,255,255,.06), 0 4px 14px rgba(0,0,0,.12)' },
  { id: 'lace', name: 'Dantel', description: 'Minik noktalı, romantik çerçeveler', radius: 24, blur: 0, shadow: 'inset 0 0 0 4px var(--theme-panel), inset 0 0 0 5px color-mix(in srgb, var(--theme-accent) 12%, transparent), 0 5px 16px rgba(0,0,0,.12)' },
  { id: 'satin', name: 'Saten', description: 'Yumuşacık köşeler, hafif kumaş ışıltısı', radius: 26, corners: '26px 26px 18px 18px', blur: 0, shadow: 'inset 0 1px 0 rgba(255,255,255,.08), inset 0 -1px 0 color-mix(in srgb, var(--theme-accent) 15%, transparent), 0 6px 18px rgba(0,0,0,.14)' },
  { id: 'sweetheart', name: 'Kalp', description: 'İki loblu, romantik kalp silueti', radius: 28, blur: 0, shadow: 'none' },
  { id: 'heart-glass', name: 'Cam kalp', description: 'Parlak, cam gibi kalp yüzeyi', radius: 28, blur: 0, shadow: 'none' },
  { id: 'heart-pearl', name: 'İnci kalp', description: 'Sedef ışıltılı zarif kalp', radius: 28, blur: 0, shadow: 'none' },
  { id: 'heart-lace', name: 'Dantel kalp', description: 'İlmekli kenarlar, romantik kalp', radius: 28, blur: 0, shadow: 'none' },
  { id: 'heart-satin', name: 'Saten kalp', description: 'Kumaş ışıltısı, yumuşak kalp', radius: 28, blur: 0, shadow: 'none' },
  { id: 'folded-paper', name: 'Kâğıt kıvrımı', description: 'Çokgen kenarlar, origami katları', radius: 8, blur: 0, shadow: 'none' },
  { id: 'rainbow-neon', name: 'Gökkuşağı neon', description: 'Çok renkli, ışıklı çerçeve', radius: 16, blur: 0, shadow: '0 0 14px color-mix(in srgb, var(--theme-accent) 20%, transparent)' },
  { id: 'comic-heart', name: 'Pop kalp', description: 'Çizgi roman noktaları, kalp şekli', radius: 28, blur: 0, shadow: 'none' },
];

export function getSurfaceStyle(themeId, override = 'auto') {
  const id = override === 'auto' ? getColorTheme(themeId).style : override;
  return SURFACE_STYLES.find((style) => style.id === id) || SURFACE_STYLES[0];
}

export function surfaceVariables(style, theme = COLOR_THEMES[0]) {
  return { '--theme-radius': style.corners || `${style.radius}px`, '--theme-blur': `${style.blur}px`, '--theme-shadow': style.shadow, '--theme-artwork': surfaceArtwork(style.id, theme) };
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
