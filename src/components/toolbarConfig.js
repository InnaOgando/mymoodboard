import { PRESET_COLORS } from '../colors'

// Colours for the Idea background colour panel
export const BG_COLORS = [
  '#ffffff', '#fff9c4', '#ffe0e0', '#e0f0ff',
  '#e0ffe8', '#f3e0ff', '#ffe8d0', '#e8e8e8',
]

// Panel definitions — keyed by panel id.
// BoardToolbar reads this to know how to render the active panel.
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
    initText: el => el?.content?.caption ?? '',
    onSubmit: (text, actions) => actions.onCaption?.(text),
  },
  title: {
    type: 'text',
    placeholder: 'Add title…',
    initText: el => el?.content?.title ?? '',
    onSubmit: (text, actions) => actions.onAddTitle?.(text),
  },
}

// Sentinel for visual separators in the toolbar row
const SEP = { id: '__sep__', sep: true }

// Common actions shared by all non-collection types.
// locked is evaluated at call time so active/hidden state is baked in.
function commonItems(locked) {
  return [
    SEP,
    { id: 'lock',   label: locked ? 'Locked' : 'Lock', icon: locked ? '🔒' : '🔓', active: locked, action: 'onLock' },
    ...(!locked ? [{ id: 'group',  label: 'Group',  icon: '⊞', action: 'onGroup' }] : []),
    { id: 'copy',   label: 'Copy',   icon: '⊡', action: 'onCopy' },
    ...(!locked ? [{ id: 'cut',    label: 'Cut',    icon: '✂', action: 'onCut' }] : []),
    { id: 'dup',    label: 'Dup',    icon: '⧉', action: 'onDuplicate' },
    ...(!locked ? [{ id: 'delete', label: 'Delete', icon: '×', danger: true, action: 'onDelete' }] : []),
  ]
}

/**
 * Build the full toolbar config for the current selection.
 *
 * Each item shape:
 *   { id, label, icon?, iconStyle?, action?, panel?, initText?, danger?, active?, sep? }
 *
 * sep:       renders a visual separator, no other fields needed
 * action:    key into the `actions` prop object in BoardToolbar
 * panel:     panel id to toggle; BoardToolbar matches it against PANEL_DEFS
 * initText:  initial value to seed the text input when a panel opens
 * iconStyle: object spread onto the icon <span> style when `icon` is absent
 * danger:    applies danger styling
 * active:    applies active styling (e.g. Lock when locked, open panel btn)
 */
export function buildToolbarConfig({ el, locked }) {
  const c = commonItems(locked)

  return {
    image: [
      {
        id: 'caption', label: 'Caption', icon: '✏',
        panel: 'caption', initText: el?.content?.caption ?? '',
      },
      ...c,
    ],

    idea: [
      {
        id: 'bgColor', label: 'Color',
        iconStyle: {
          width: 18, height: 18, borderRadius: 4, display: 'inline-block',
          background: el?.content?.bgColor || '#fff',
          border: '1px solid #ccc', verticalAlign: 'middle',
        },
        panel: 'bgColor',
      },
      ...c,
    ],

    todo: [
      {
        id: 'title', label: 'Title', icon: 'T',
        panel: 'title', initText: el?.content?.title ?? '',
      },
      ...c,
    ],

    palette: [
      { id: 'edit', label: 'Edit', icon: '🎨', action: 'onEdit' },
      ...c,
    ],

    link: [
      { id: 'edit', label: 'Edit', icon: '✏', action: 'onEdit' },
      ...c,
    ],

    document: c,

    collection: [
      { id: 'rename', label: 'Rename', icon: '✏', action: 'onRename' },
      { id: 'color',  label: 'Color',  icon: '🎨', panel: 'colColor' },
      SEP,
      { id: 'dup',    label: 'Dup',    icon: '⧉', action: 'onDuplicate' },
      { id: 'delete', label: 'Delete', icon: '×',  danger: true, action: 'onDelete' },
    ],

    // No selection — toolbar is in creation mode, no items needed here
    none: [],
  }
}
