# RefMemo Product Behavior Specification

Version 1.2

---

## Product Philosophy

RefMemo is not a storage application.

It is a visual thinking workspace.

The user works directly with references, ideas and notes.

The app should never interrupt creative flow.

Every action should feel immediate.

The user should never wonder:

- Did it save?
- Where did it go?
- Why did it move?
- Why did it change size?

Behaviour must always be predictable.

---

## Product Priorities

When two requirements conflict, the application must always prioritize them in the following order.

### Priority 1 — Never Lose User Data

User content is more important than every other feature.

The application must never:

- Lose data
- Overwrite newer data with older data
- Delete data because of synchronization failures

### Priority 2 — Predictable Behaviour

The application should always behave consistently.

The same action should always produce the same result.

### Priority 3 — Immediate Feedback

Every user action should immediately update the interface.

Saving and synchronization always happen afterwards.

The interface must never wait for:

- Network
- Upload
- Synchronization
- Database writes

### Priority 4 — Offline First

Whenever technically possible, every feature should work without an internet connection.

If a feature cannot work offline, clearly inform the user.

### Priority 5 — Synchronization

Synchronization should happen automatically.

Synchronization must never interrupt creative work.

### Priority 6 — Visual Polish

Animations and visual effects are important, but never at the expense of:

- Reliability
- Speed
- Predictability

---

## The Application Must Never

- Lose user content
- Create duplicate objects
- Create duplicate boards
- Place new objects randomly
- Overlap objects when free space exists
- Resize objects without user action
- Crop images without user action
- Replace images with thumbnails
- Require a page refresh before showing changes
- Block the interface while saving
- Display different data for the same authenticated user on different devices
- Delete local data because synchronization failed
- Make creative decisions for the user

---

## Golden Rule

Whenever there is uncertainty about how a feature should behave, choose the solution that preserves the user's existing workspace.

The application should organize the workspace.

It should never reinterpret, rearrange, or redesign the user's work.

Every implementation should be judged by one question:

> **Does this preserve the user's creative flow?**

---

## Source of Truth

React State

↓

IndexedDB

↓

Supabase Synchronization

Rules:

- UI always renders from local state.
- IndexedDB is the working database.
- Supabase is only for synchronization.
- UI never waits for network activity.

---

# 1. Boards

## Purpose

Boards separate projects.

One board = one project.

Examples:

- Picture Book
- Character Design
- Forest References
- Client Project

## Behaviour

### Create

- Board appears immediately.
- Automatically selected.
- Saved in background.
- New board appears beside the last created board.
- Keep boards inside the visible viewport.
- If there is no horizontal space, continue on the next row.
- Never overlap boards.
- One tap = select board.
- Drag & drop = move board.
- Two taps = open board.

### Name

- Each board has an original name.
- Name can be changed.
- Name changes immediately.

### Delete

- Board disappears immediately.
- User must confirm board deletion.
- Undo available.

### Duplicate

- Creates a copy.
- Appears beside the original.

### Color

- Each new board receives a different color from the default palette.
- User can change the color.
- Changes immediately.

### Move

- Boards can be rearranged.
- Order persists.
- Boards never overlap.

---

# 2. Canvas

The canvas is an infinite workspace.

Users can:

- Pan
- Zoom

The canvas background is neutral and never distracts from the content.

The viewport is the user's current working area.

New objects should always appear inside the visible viewport.

Never:

- Outside the viewport
- Randomly
- Overlapping another object when free space exists

## Placement Algorithm

Priority:

1. Place beside the last created or last placed object.
2. Continue the current row.
3. Start a new row when necessary.
4. Stay inside the visible viewport.
5. Maintain a minimum 4 px gutter between objects.
6. Never overlap existing objects if free space exists.

---

# 3. Images

## Purpose

Visual references.

Images are the primary object type.

## Behaviour

### Import Sources

- Photos
- Camera
- Files
- Clipboard
- Share Sheet (future)

### After Import

- Image appears immediately.
- Original aspect ratio preserved.
- Automatically selected.
- Placed according to the placement algorithm.
- Never randomly positioned.
- Never overlaps other objects.

### Resize

- One tap selects the image.
- Resize using the bottom-right resize handle.
- Changes only the selected image.

### Move

- One tap selects the image.
- Drag & drop to move.

### Preview

- No preview mode.

### Delete

- Undo available.

### Offline

- Images always remain visible.

---

# 4. Collections

## Purpose

Collections organize related objects.

Collections are NOT:

- Storage
- Folders
- Galleries
- Thumbnail containers

Collections are visual groups.

## Creating

- Every object has a **+ Collection** menu.
- Collection is created from one selected object.
- Other objects are added by drag & drop into the Collection.
- New objects are placed beside the last placed object with a minimum 4 px gutter.

Objects keep:

- Original size
- Original aspect ratio
- Original dimensions
- Original relative positions

Collection only adds:

- Boundary
- Title
- Color

## Object Behaviour Inside Collections

Unless explicitly stated otherwise, every object inside a Collection behaves exactly the same as an object placed directly on the canvas.

Collections change only ownership and movement.

Collections never change:

- Object appearance
- Object size
- Object interaction
- Object functionality

## Moving

Moving a Collection moves all contained objects together.

## Resizing

Changes only the Collection boundary.

Objects never:

- Resize
- Scale
- Crop
- Become thumbnails
- Change layout automatically

Objects remain fully usable.

## Images Inside Collections

Images remain exactly the same objects.

Collections never:

- Create thumbnails
- Replace images with previews
- Modify image dimensions

Images remain:

- Individually selectable
- Individually resizable

## Remove Object

Objects remain inside a Collection until explicitly removed.

Dragging outside the Collection does not remove the object.

Removal is performed only using the Remove button.

After removal:

- Place object in the nearest available space beside the Collection.
- Never overlap another object.

## Empty Collection

When the last object is removed:

- Collection disappears automatically.

---

# 5. Ideas

## Purpose

Quick thoughts.

Contains:

- Title
- Unlimited text field

Behaviour:

- Create immediately.
- Title editable.
- Text editable.
- Resize changes only the boundary.
- Text size never changes.
- Speech-to-text supported.

---

# 6. Links

## Purpose

Save external references.

Contains:

- Optional title
- URL

Behaviour:

- Title editable.
- URL editable.
- Resize changes only the boundary.
- Text size never changes.

---

# 7. Todo

## Purpose

Small actionable tasks.

Behaviour:

- Simple checklist.
- Resize changes only the boundary.
- Text size never changes.

---

# 8. Palette

## Purpose

Save project colors.

Behaviour:

- Rounded square color swatches.
- Each swatch displays HEX and RGB values.
- Shared preset color palette.
- Custom colors via color picker.
- Resize changes only the boundary.

---

# 9. Object Behaviour

All object types follow the same interaction rules.

## Selection

- Single tap = select object.
- Tap empty canvas = clear selection.
- Multiple selection only for creating Collections.

## Add to Collection

- Select object.
- Drag & drop into Collection.

## Remove from Collection

- Select object.
- Press Remove.
- Place beside the Collection in nearest available space.
- Never overlap another object.

## Move

- Immediate.

## Resize

Images:

- Resize changes image dimensions.

Other objects:

- Resize changes only the object boundary.

## Delete

- Undo available.

## Drag

- Works everywhere.

## Offline

- Works identically online and offline.

---

# 10. Offline

- User should never think about synchronization.
- Offline and online behaviour should feel identical.
- Everything works locally.
- Synchronization happens automatically.

User can:

- Create boards
- Create objects
- Edit objects
- Delete objects

Unavailable features display:

> Not available offline.

If synchronization fails:

- Never block the user.
- Keep local data.
- Retry automatically.
- Never delete local content.

---

# 11. Performance

The interface never waits for:

- Network
- Upload
- Synchronization

Every action updates immediately.

Persistence happens afterwards.

---

# 12. Design Principles

RefMemo should feel like working on a physical desk.

Objects are never:

- Hidden
- Unexpectedly transformed
- Automatically reorganized
- Unexpectedly resized
- Unexpectedly cropped
- Overlapped when free space exists

Objects maintain a minimum 4 px gutter.

The application helps organize ideas.

It never makes creative decisions for the user.
