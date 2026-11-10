---
type: constraint
title: Review exported files before publication
summary: Exports overwrite generated paths but never delete stale pages, can stop partway on write errors, and produce plain Markdown without assets or site configuration.
severity: warning
aliases:
  - trang tài liệu cũ
  - stale exported pages
  - partial export
---

- Existing files at generated paths are overwritten. Unrelated files in the output directory are kept.
- Removed or renamed nodes leave their old pages behind. Export into a fresh, dedicated directory before publishing.
- A write error can leave a partial export. The command returns exit code 2 and is safe to run again.
- The output is plain Markdown with relative `.md` links. It has no site engine configuration and copies no assets. Raw MDX or HTML in node bodies and heading-slug conventions are the consuming site's responsibility.
- Availability options change the recommendations in goal guides; they do not filter pages or control access.
