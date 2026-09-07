# Future: Google Tasks

Google Tasks is not implemented in alpha. A future `TaskProvider` adapter will project Sonata tasks to a provider while retaining Sonata's ULID, Markdown, tags, links, reminder, and hierarchy model. Provider IDs never replace Sonata IDs; sync conflicts must preserve both changes for explicit resolution.
