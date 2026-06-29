# RefMemo Documentation

## Recommended repository structure

``` text
/docs
├── PRODUCT_SPEC.md
├── ARCHITECTURE.md
├── RELEASE_CHECKLIST.md
├── CHANGELOG.md
└── decisions/
```

# PRODUCT_SPEC.md

Version: 1.1
 
Status: Active

This document is the single source of truth for RefMemo user behavior.

If the implementation differs from this specification, the specification
is correct.

Developers must update this document before changing product behavior.

Bug fixes should restore behavior defined here, not redefine it.

## Purpose

This specification defines how RefMemo behaves, not how it is
implemented.

Implementation may change as long as user behaviour remains identical.

If code and specification disagree, the specification wins.

## Product Philosophy

-   RefMemo is a visual thinking workspace.
-   It is not a storage application.
-   The app should never interrupt creative flow.
-   Every action should feel immediate.
-   Behaviour must always be predictable.

Users should never wonder: - Did it save? - Where did it go? - Why did
it move? - Why did it change size?

## Product Priorities

1.  Never lose user data.
2.  Predictable behaviour.
3.  Immediate UI feedback.
4.  Offline-first.
5.  Automatic synchronization.
6.  Visual polish.

## Source of Truth

React State

↓

IndexedDB

↓

Supabase Synchronization

Rules:

-   UI always renders from local state.
-   IndexedDB is the working database.
-   Supabase is only for synchronization.
-   UI never waits for network activity.

## Collections

Collections are visual groups.

They are not folders, storage, galleries or thumbnail containers.

Objects inside Collections behave exactly like objects on the canvas
unless explicitly stated otherwise.

Collections only manage: - grouping - movement - boundary - title -
color

Collections never change: - appearance - size - aspect ratio -
functionality

## The Application Must Never

-   Lose user content.
-   Create duplicate boards or objects.
-   Place new objects randomly.
-   Overlap objects when free space exists.
-   Resize objects without user action.
-   Crop images without user action.
-   Replace images with thumbnails.
-   Require page refresh to show changes.
-   Block the UI while saving.
-   Show different data for the same user on different devices.
-   Delete local data because synchronization failed.

## Change Policy

Every user interaction change must be documented here before
implementation.

Implementation follows the specification.

If code and specification disagree, the specification wins.
