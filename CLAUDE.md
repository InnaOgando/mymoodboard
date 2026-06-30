# RefMemo — Claude Code Context

## Project

React + Vite PWA. IndexedDB (idb) for local persistence, Supabase for sync.
Source of truth: React State → IndexedDB → Supabase.

Working directory: `/Users/innayaz/Pictures/Projetos/Illustration Basic/refbook`
Spec: `docs/PRODUCT_SPEC_v1.2.md` — implementation must match this exactly, no invention.

## Git workflow

- NEVER `git push` via CLI. User pushes through GitHub Desktop only.
- Always commit after every discrete change.

## Architecture

- `src/components/BoardScreen.jsx` — main canvas screen; owns all element state, placement, paste
- `src/components/DraggableCard.jsx` — unified tap/drag/double-tap/long-press handler for canvas objects
- `src/components/ResizeHandle.jsx` — bottom-right resize grip; movement-threshold-based claim (never claims on pointerdown)
- `src/components/ObjectRenderer.jsx` — routes `el.type` to the correct object component
- `src/components/BoardToolbar.jsx` — pure renderer driven by `TOOLBAR_CONFIG` / `PANEL_DEFS`
- `src/components/toolbarConfig.js` — config source for toolbar buttons per object type
- `src/components/objects/` — one file per object type (ImageObject, PaletteObject, LinkObject, DocumentObject, …)
- `src/App.css` — all styles

## Key behaviours

### Double-tap detection (`DraggableCard`)
- `DOUBLE_TAP_MS = 420`
- `lastTapTime` ref compared in `onPointerUp`
- Non-primary pointer (pinch) sets `moved.current = true` to suppress false tap

### ResizeHandle gesture
- Does NOT `stopPropagation` on `pointerdown` — tap still bubbles to `DraggableCard`
- Commits to resize only after `MOVE_THRESHOLD = 4px` movement
- `setPointerCapture` on pointerdown for fast-movement coverage, not gesture claim

### DraggableCard + ResizeHandle coexistence
- `isResizeHandle = e.target.closest('.resize-handle')` guards the long-press timer
- If pointer started on resize-handle: no long-press armed; tap/double-tap still work normally via `onPointerUp`

### Placement algorithm
- `findFreePosition(existingElements, childBoards, viewportBounds, objW, objH)` in `BoardScreen.jsx`
- `makeViewportBounds(containerRef, offsetRef, scaleRef)` computes visible canvas area
- ALL 9 creation paths (image, idea, palette, link, document, collection, child board, duplicate, paste) must use this shared function — no exceptions

### Clipboard (copy/paste)
- `copyElement(el)` → `sessionStorage.setItem('refmemo_clipboard', JSON.stringify(el))`
- `pasteElement()` reads it back, places via `findFreePosition`
- Triggered by Cmd+V (desktop) AND Paste button in creation toolbar (mobile)
- Paste button only renders when clipboard has content: `!!sessionStorage.getItem('refmemo_clipboard')`

### Toolbar config
- `TOOLBAR_CONFIG` keyed by type; `palette` and `link` use `COMMON` only (no Edit button)
- Edit (double-tap to enter) is handled by `DraggableCard` → `onDoubleTap` → `setEditingId`

## Bug fix sprint — status (as of 2026-06-30)

All 10 bugs from `docs/PRODUCT_SPEC_v1.2.md` addressed. Commits pending user verification sign-off.

| # | Bug | Status |
|---|-----|--------|
| 1 | Image preview: double-tap unreliable | Fixed — ResizeHandle rewritten with movement-threshold; DraggableCard guards long-press |
| 2 | Copy/paste: paste had no UI trigger | Fixed — Cmd+V fallback + mobile Paste button wired to `pasteElement()` |
| 3 | Palette: card/container UI wrong | Fixed — bare swatch row, no card, no header |
| 4 | Palette editing: tapping dead | Fixed — double-tap opens native `<input type="color">` via `editing` prop |
| 5 | Palette: duplicate toolbar controls | Fixed — removed Edit button from palette toolbar config |
| 6 | Link: unnecessary LINK header | Fixed — drag-handle header div removed from LinkObject |
| 7 | Link editing: keyboard doesn't appear | Fixed — removed `setTimeout` around `urlRef.current?.focus()` |
| 8 | Image placement: appears far from workspace | Fixed — `findFreePosition` overflow fallback uses `lowestBottom + GAP` not `startY + viewportBounds.h` |
| 9 | Document: select/move/resize/delete broken | Fixed — added ResizeHandle + standard prop contract to DocumentObject |
| 10 | Shared placement inconsistent | Fixed — all 9 creation paths use `findFreePosition`; removed dead `duplicateCollection` |

## Palette object — final design (user-confirmed)

- Bare rounded square swatch(es), no card wrapper, no header
- One `<input type="color" hidden>` per swatch; opened via `.click()` when `editing === true`
- HEX code shown **below** the swatch (not overlaid on it), dark readable color
- HEX text must be user-selectable/copyable (`user-select: text`)
- No RGB display
- Object width = `swatch_size * count + gap * (count - 1)`; resize changes swatch size

## Palette CSS classes (current)
- `.el-palette-row` — flex row container (no border, no background)
- `.palette-swatch-sq` — individual swatch square
- `.palette-swatch-sq--light` — adds border for near-white colors
- `.palette-hex` — HEX label below swatch
- `.palette-color-input-hidden` — hidden native color picker

## `normalizeType(type)`
Maps legacy names: `text/note` → `idea`, `color` → `palette`, `column` → `collection`

## INTERACTIVE set
`Set(['INPUT', 'TEXTAREA', 'SELECT', 'A'])` — these elements get native pointer handling; DraggableCard returns early without `stopPropagation` for them.
