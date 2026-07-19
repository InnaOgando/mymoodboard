// Shared preset color palette — used by Boards, Collections, and Palette objects.
// Source: src/assets/Refmemo_icons/color scheme.svg (app color scheme), visual order.
export const PRESET_COLORS = [
  '#fdd8ad', // peach
  '#f9aca9', // salmon
  '#fc8292', // coral pink
  '#eedcf7', // lilac
  '#eda2d2', // pink
  '#cea7db', // mauve
  '#d6d9dd', // light gray
  '#cae5dc', // mint
  '#afe2e3', // aqua
  '#7ccbd0', // teal
  '#b7e7fd', // sky
  '#7aa7f4', // blue
  '#9db8dd', // blue-gray
  '#b3b8c0', // slate
]

// Returns a readable text color (dark or white) for a given background hex.
// Presets are pastel, so most resolve to dark text; very dark colors get white.
export function readableTextColor(hex) {
  if (!hex) return '#2a2a2a'
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#2a2a2a' : '#ffffff'
}
