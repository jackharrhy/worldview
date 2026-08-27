# Semantic authoring and history

## Sub-features

Object/source queries, selection, framing, tool activation, transforms, material and entity edits,
box and point-entity creation, duplication, deletion, stale-revision rejection, undo, and redo.

## How to get to it (user POV)

Select objects or faces, choose an editing tool or command, perform the edit, and use Undo/Redo.
The canvas, selection summary, document revision, status, and history controls visibly agree.

## Driving it with WebMCP and Playwright

Use the helper for the canonical select → translate → inspect → undo flow. For another operation,
inspect first and pass the observed document identity/revision into every mutating WebMCP call.
Capture a screenshot after the action and after history restoration, plus tool results in JSON.

## Gotchas

Selection and camera operations do not increment the document revision. Undo creates a later
revision; prove restoration with source content or object bounds, not revision equality.
