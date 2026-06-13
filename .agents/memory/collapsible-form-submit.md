---
name: Collapsible/conditionally-rendered form inputs
description: Why selections inside collapsed sections silently fail to submit, and the fix.
---
Native form submission serializes the DOM, not React state. Checkboxes/inputs that
live inside a conditionally-rendered block (`{isOpen && ...}`, collapsed accordion
groups, tabs) are NOT in the DOM when collapsed, so their values are dropped from
the POST even though React state shows them selected.

**Why:** A multi-select grouped into collapsible department sections looked correct
(selected count, Select-all) but submitted partial/empty `target` lists whenever a
group was collapsed before submit.

**How to apply:** Keep selection in React state and emit the payload from state via
always-mounted hidden inputs (`{Array.from(selected).map(id => <input type="hidden"
name="target" value={id}/>)}`). Make the visible checkboxes UI-only (no `name`) so
open groups don't double-submit. Alternative: keep inputs mounted and collapse with
CSS only.
