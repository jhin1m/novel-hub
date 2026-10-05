---
name: feedback-verify-research-claims
description: Researcher reports for novel-hub UI work can be wrong on library behavior (e.g. Radix Dialog modal={false}); controller corrects them in the task prompt
metadata:
  type: feedback
---

Controller-supplied corrections and `[auto]` decisions override researcher/scout recommendations; never copy a research recommendation into a phase without checking it against the controller's decision list and the live code.

**Why:** In the 2026-10-06 B+ redesign plan, research-02 Q1 claimed Radix Dialog `modal={false}` still traps focus/locks scroll (false), and research-01 suggested mapping legacy font `inter → source-serif-4` while the controller chose `plus-jakarta-sans`.

**How to apply:** When writing phase files, cite the controller decision, mark contradicted research as "không dùng", and verify file:line/line counts with grep/wc before writing (scout line numbers drifted, e.g. badge at `chapter-editor.tsx:390`, not 417).
