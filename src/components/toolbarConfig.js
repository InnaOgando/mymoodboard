/**
 * Toolbar configuration — single source of truth for all object actions.
 *
 * Adding or changing a toolbar action requires editing only this file.
 * BoardToolbar contains no object-specific logic; it only reads and renders.
 *
 * ── Item shape ───────────────────────────────────────────────────────────────
 *
 *   id        string       React key + action identifier
 *   sep?      bool         Renders a visual separator; no other fields used
 *
 *   label     string | (el) => string    Button label
 *   icon?     string | (el) => string    Emoji / symbol for the icon span
 *   iconStyle? (el) => CSSProperties    Alternative to icon for dynamic swatches
 *
 *   action?   string       Key in the actions prop passed to BoardToolbar
 *   panel?    string       Panel id to toggle (see PANEL_DEFS)
 *   initText? (el) => string   Seeds the text input when the panel opens
 *
 *   visible?  (el) => bool   When false the item is hidden (default: always shown)
 *   active?   (el) => bool   When true the button gets active styling
 *   danger?   bool           Applies danger/destructive styling
 *
 * ── Panel shape (PANEL_DEFS) ─────────────────────────────────────────────────
 *
 *   type        'colors' | 'text'
 *   colors?     string[]           Swatch colours (type === 'colors')
 *   activeColor? (el) => string    Currently selected colour
 *   onSelect?   (color, actions) => void
 *   placeholder? string            Input placeholder (type === 'text')
 *   onSubmit?   (text, actions) => void
 */

import { PRESET_COLORS } from '../colors'

// ── Panel definitions ─────────────────────────────────────────────────────────

const BG_COLORS = [
  '#ffffff', '#fff9c4', '#ffe0e0', '#e0f0ff',
  '#e0ffe8', '#f3e0ff', '#ffe8d0', '#e8e8e8',
]

export const PANEL_DEFS = {
  bgColor: {
    type: 'colors',
    colors: BG_COLORS,
    activeColor: el => el?.content?.bgColor ?? null,
    onSelect: (color, actions) => actions.onBgColor?.(color),
  },
  colColor: {
    type: 'colors',
    colors: PRESET_COLORS,
    activeColor: el => el?.content?.color ?? null,
    onSelect: (color, actions) => actions.onColor?.(color),
  },
  caption: {
    type: 'text',
    placeholder: 'Add caption…',
    onSubmit: (text, actions) => actions.onCaption?.(text),
  },
  title: {
    type: 'text',
    placeholder: 'Add title…',
    onSubmit: (text, actions) => actions.onAddTitle?.(text),
  },
}

// ── Reusable action descriptors ───────────────────────────────────────────────

const LOCK   = { id: 'lock',   label: el => el.locked ? 'Locked' : 'Lock', icon: el => el.locked ? '🔒' : '🔓', action: 'onLock',      active:  el => !!el.locked }
const GROUP  = { id: 'group',  label: 'Group',  icon: '⊞', action: 'onGroup',     visible: el => !el.locked }
const COPY   = { id: 'copy',   label: 'Copy',   icon: '⊡', action: 'onCopy' }
const CUT    = { id: 'cut',    label: 'Cut',    icon: '✂', action: 'onCut',       visible: el => !el.locked }
const DUP    = { id: 'dup',    label: 'Dup',    icon: '⧉', action: 'onDuplicate' }
const DELETE = { id: 'delete', label: 'Delete', icon: '×', action: 'onDelete',    danger:  true, visible: el => !el.locked }

const SEP    = { id: '__sep__', sep: true }

// Common trailing actions for all non-collection types.
// Types that have a leading type-specific action prepend a separator themselves.
const COMMON = [LOCK, GROUP, COPY, CUT, DUP, DELETE]

// ── Toolbar configuration per object type ─────────────────────────────────────

export const TOOLBAR_CONFIG = {
  image: [
    { id: 'caption',  label: 'Caption', icon: '✏',
      panel: 'caption', initText: el => el?.content?.caption ?? '' },
    SEP,
    ...COMMON,
  ],

  idea: [
    { id: 'bgColor',  label: 'Color',
      iconStyle: el => ({
        width: 18, height: 18, borderRadius: 4, display: 'inline-block',
        background: el?.content?.bgColor || '#fff',
        border: '1px solid #ccc', verticalAlign: 'middle',
      }),
      panel: 'bgColor' },
    SEP,
    ...COMMON,
  ],

  todo: [
    { id: 'title',    label: 'Title', icon: 'T',
      panel: 'title', initText: el => el?.content?.title ?? '' },
    SEP,
    ...COMMON,
  ],

  palette: COMMON,

  link: COMMON,

  document: COMMON,

  collection: [
    { id: 'rename', label: 'Rename', icon: '✏', action: 'onRename' },
    { id: 'color',  label: 'Color',  icon: '🎨', panel: 'colColor' },
    SEP,
    DUP,
    DELETE,
  ],
}
