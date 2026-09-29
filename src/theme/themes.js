// Every color the app used to hardcode lives here instead, grouped into a
// handful of named palettes a user can switch between (see ThemeContext.js).
// Each palette provides the exact same set of keys so every screen can
// consume `colors.xxx` without caring which palette is active.

const LIGHT_SEMANTIC = {
  success: '#2E7D32',
  successLight: '#E8F5E9',
  successBorder: '#A5D6A7',
  error: '#D64A2E',
  errorLight: '#FDEAE6',
  errorBorder: '#F5C4B8',
  info: '#2F5FAE',
  infoLight: '#EAF1FD',
  infoBorder: '#C4D7F5',
};

const DARK_SEMANTIC = {
  success: '#6FCF7A',
  successLight: '#1E3323',
  successBorder: '#2F5138',
  error: '#FF8A75',
  errorLight: '#3A2320',
  errorBorder: '#5C332C',
  info: '#7FB1FF',
  infoLight: '#1E2A3F',
  infoBorder: '#2C3E5A',
};

// `primaryLight`/`primaryBorder` are the soft tint used behind category
// badges, active-ish backgrounds, etc. `textOnPrimary` is whatever reads
// cleanly on top of a solid `primary` fill (button labels, active chips).
const PALETTES = [
  {
    key: 'coral',
    label: 'Coral',
    mode: 'light',
    primary: '#FF6B4A',
    primaryLight: '#FFF1EC',
    primaryBorder: '#F7D9CC',
    textOnPrimary: '#FFFFFF',
    background: '#F7F5F2',
    surface: '#FFFFFF',
    border: '#E0DCD5',
    textPrimary: '#2B2B2B',
    textSecondary: '#8A8A8A',
    textMuted: '#B0AAA2',
    ...LIGHT_SEMANTIC,
  },
  {
    key: 'ocean',
    label: 'Ocean',
    mode: 'light',
    primary: '#2F80ED',
    primaryLight: '#E8F1FE',
    primaryBorder: '#C9DFFB',
    textOnPrimary: '#FFFFFF',
    background: '#F2F6FB',
    surface: '#FFFFFF',
    border: '#DCE6F0',
    textPrimary: '#20304A',
    textSecondary: '#7A8AA0',
    textMuted: '#AAB8C9',
    ...LIGHT_SEMANTIC,
  },
  {
    key: 'forest',
    label: 'Forest',
    mode: 'light',
    primary: '#3E8E5A',
    primaryLight: '#E7F5EC',
    primaryBorder: '#C9E7D3',
    textOnPrimary: '#FFFFFF',
    background: '#F3F7F1',
    surface: '#FFFFFF',
    border: '#DCE8DE',
    textPrimary: '#233229',
    textSecondary: '#7C8C7F',
    textMuted: '#ADBAAF',
    ...LIGHT_SEMANTIC,
  },
  {
    key: 'berry',
    label: 'Berry',
    mode: 'light',
    primary: '#B23A72',
    primaryLight: '#FBEAF1',
    primaryBorder: '#EFCADD',
    textOnPrimary: '#FFFFFF',
    background: '#FAF3F6',
    surface: '#FFFFFF',
    border: '#EFD9E3',
    textPrimary: '#33222B',
    textSecondary: '#96828C',
    textMuted: '#C6AFB9',
    ...LIGHT_SEMANTIC,
  },
  {
    key: 'sunset',
    label: 'Sunset',
    mode: 'light',
    primary: '#E8873E',
    primaryLight: '#FDF0E1',
    primaryBorder: '#F4DBB8',
    textOnPrimary: '#FFFFFF',
    background: '#FBF6EF',
    surface: '#FFFFFF',
    border: '#F0E2CE',
    textPrimary: '#3A2E22',
    textSecondary: '#96897A',
    textMuted: '#C7B9A6',
    ...LIGHT_SEMANTIC,
  },
  {
    key: 'midnight',
    label: 'Midnight',
    mode: 'dark',
    primary: '#7C9CFF',
    primaryLight: '#232C48',
    primaryBorder: '#33406A',
    textOnPrimary: '#12142B',
    background: '#14161B',
    surface: '#1E212A',
    border: '#2B2F3A',
    textPrimary: '#ECEDEF',
    textSecondary: '#9AA0AC',
    textMuted: '#6B7280',
    ...DARK_SEMANTIC,
  },
];

export const THEMES = PALETTES.reduce((acc, palette) => {
  acc[palette.key] = palette;
  return acc;
}, {});

export const THEME_LIST = PALETTES;

export const DEFAULT_THEME_KEY = 'coral';

export function getTheme(themeKey) {
  return THEMES[themeKey] || THEMES[DEFAULT_THEME_KEY];
}
