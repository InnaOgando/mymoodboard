# Product Specification Additions — MERGED

All content from this file has been merged into PRODUCT_SPEC.md (v1.2).
This file is kept for reference only. Edit PRODUCT_SPEC.md directly.

---

## Add to Section 4 — Collections

### Object Behaviour Inside Collections

Unless explicitly stated otherwise, every object inside a Collection behaves exactly the same as an object placed directly on the canvas.

Collections change only ownership and movement.

Collections never change:

- Object appearance
- Object size
- Object interaction
- Object functionality

---

# 14. Product Priorities

When two requirements conflict, the application must always prioritize them in the following order.

## Priority 1 — Never Lose User Data

User content is more important than every other feature.

The application must never:

- Lose data
- Overwrite newer data with older data
- Delete data because of synchronization failures

---

## Priority 2 — Predictable Behaviour

The application should always behave consistently.

The same action should always produce the same result.

---

## Priority 3 — Immediate Feedback

Every user action should immediately update the interface.

Saving and synchronization always happen afterwards.

The interface must never wait for:

- Network
- Upload
- Synchronization
- Database writes

---

## Priority 4 — Offline First

Whenever technically possible, every feature should work without an internet connection.

If a feature cannot work offline, clearly inform the user.

---

## Priority 5 — Synchronization

Synchronization should happen automatically.

Synchronization must never interrupt creative work.

---

## Priority 6 — Visual Polish

Animations and visual effects are important, but never at the expense of:

- Reliability
- Speed
- Predictability

---

# 15. The Application Must Never

The application must never:

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

# 16. Golden Rule

Whenever there is uncertainty about how a feature should behave, choose the solution that preserves the user's existing workspace.

The application should organize the workspace.

It should never reinterpret, rearrange, or redesign the user's work.

Every implementation should be judged by one question:

> **Does this preserve the user's creative flow?**
