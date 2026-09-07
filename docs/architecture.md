# Architecture

Markdown is Sonata's canonical content store. Rust owns workspace path validation, parsing, atomic file writes, SQLite indexing, and desktop integration. React only requests coarse domain operations and renders query results.

The index contains derived metadata, FTS5 text, tags, links, parser warnings, and reminder delivery state. It can be deleted and rebuilt by scanning the workspace. IDs are ULIDs in frontmatter; filenames are readable locations, never identity.
