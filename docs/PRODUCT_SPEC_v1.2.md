# RefMemo Product Behavior Specification

Version 1.2

## Product Philosophy

RefMemo is not a storage application.

It is a visual thinking workspace where users organize references, ideas and notes without interrupting creative flow.

Every action must feel immediate, predictable and reversible.

The user should never wonder:

- Did it save?
- Where did it go?
- Why did it move?
- Why did it change size?

---

# Product Priorities

1. Never lose user data.
2. Predictable behaviour.
3. Immediate UI feedback.
4. Offline-first.
5. Automatic synchronization.
6. Visual polish.

---

# Source of Truth

React State

↓

IndexedDB

↓

Supabase Synchronization

The UI always renders from local state.

---

# 1. Boards

## Create

- Appears immediately.
- Automatically selected.
- Saved in background.
- Created beside the previous board.
- Never overlaps another board.
- Always remains inside the visible Home viewport.

## Interaction

- One tap → Select.
- Two taps → Open.
- Drag → Move.

Returning from a board restores the previous Home viewport.

---

# 2. Canvas

Infinite workspace.

Supports:

- Two-finger pinch → Zoom.
- One-finger drag on empty canvas → Pan.

Objects always appear:

- inside the visible viewport
- beside the previous object
- with minimum 4 px gutter
- never overlapping when free space exists.

---

# 3. Shared Object Behaviour

One tap → Select.

Long press → Lift animation and move object.

Resize using resize handle.

Delete always provides Undo.

Offline behaviour is identical whenever possible.

---

# 4. Images

## Import

Supported:

- Photos
- Camera
- Files
- Clipboard
- Share Sheet (future)

Imported images:

- Preserve aspect ratio.
- Appear immediately.
- Follow the placement algorithm.

## Interaction

- One tap → Select.
- Two taps → Image Preview.
- Long press → Move.
- Resize handle → Resize.

## Image Preview

- Full screen.
- Original aspect ratio.
- Uses cached image.
- Never duplicates image memory.
- Close with swipe down or Close button.

---

# 5. Collections

Collections are visual groups.

They are not:

- Storage
- Folders
- Galleries
- Thumbnail containers

Collections never modify:

- Object size
- Object appearance
- Object aspect ratio
- Object functionality

## Create

Using menu toolbar for each object.
Object get up right menu-arrow. It allow to Remove object from collection.

## Add

Drag object into Collection.

## Remove

Only using Remove icon- up right arrow on abject inside of collection.

Dragging outside does not remove.

Removed objects are placed in the nearest available free space.

## Resize

Resize Collection width changes collection layout only.

Objects:

- Never resize.
- Never crop.
- Never become thumbnails.

## Gallery

One tap object → Select.

Two taps → Open Collection Gallery.

Gallery:

- One image at a time.
- Swipe left/right between images.
- No zoom.
- No pan.


---

# 6. Ideas

Unlimited text.

Toolbar:

- Background color
- Delete
- Lock
- Group into Collection
- Copy
- Cut
- Duplicate

---

# 7. Links

Contains only a URL.

One tap → Select.

Two taps → Open URL in system browser.

Edit URL via Edit button in the bottom toolbar.

---

# 8. Todo

Default:

One checklist line.

Enter creates next line.

Two taps on line - edit.

---

# 9. Palette

Default:

One color swatch square rounded corners.

Displays:

- HEX

Two taps → Opens the operating system native color picker.

After selecting a color:

- The swatch updates immediately.
- The HEX value updates immediately.

---

# 10. Documents

Shared object behaviour.

---

# 11. Bottom Toolbar

Replace all object top menus.

Display one contextual bottom toolbar when an object is selected.

Collection:

- Title
- Delete
- Lock
- Duplicate


Image:

- Title
- Delete
- Lock
- Group
- Duplicate

Idea:

- title
- Background color
- Delete
- Lock
- Group
- Duplicate

Todo:

- title
- Delete
- Lock
- Group
- Duplicate

Palette:

- Delete
- Lock
- Group
- Duplicate

Link:

- Edit
- Delete
- Lock
- Group
- Duplicate

Document:

- Delete
- Lock
- Group
- Duplicate

---

# 12. Offline

Everything possible works locally.

Synchronization is automatic.

Never block the user.

Never delete local content.

---

# 13. Performance

UI never waits for:

- Network
- Upload
- Synchronization
- Database writes

---

# 14. Design Principles

RefMemo should feel like working on a physical desk.

The application:

- Organizes ideas.
- Never reorganizes user work.
- Never makes creative decisions.
- Never places objects randomly.
- Never overlaps objects when free space exists.

---

# 15. The Application Must Never

- Lose user data.
- Create duplicate boards.
- Create duplicate objects.
- Replace images with thumbnails.
- Require page refresh.
- Block the interface while saving.
- Display different data for the same authenticated user on different devices.

---

# 16. Golden Rule

Whenever there is uncertainty, preserve the user's existing workspace.

The application should organize the workspace.

It should never reinterpret, rearrange or redesign the user's work.

Question:

Does this preserve the user's creative flow?
