# Workspace format

Sonata initializes `inbox`, `tasks`, `notes`, `ideas`, `bookmarks`, `archive`, `attachments`, `.trash`, and `.sonata`. `.sonata/config.json` is workspace configuration and `.sonata/index.db` is regenerable. Documents use YAML frontmatter plus ordinary GFM Markdown. Unknown frontmatter keys survive Sonata edits.

Attachments are copied to `attachments/<document-id>/`. Sonata inserts ordinary workspace-relative Markdown references such as `![photo.png](attachments/<document-id>/photo.png)` (or a normal link for non-images), so notes remain readable outside the app. An image cover is stored as the optional `cover` frontmatter key pointing to that same relative attachment path.
