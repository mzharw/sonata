# ADR-005: Rust owns filesystem access

The webview has no arbitrary filesystem API. Rust validates all workspace paths and handles atomic writes.
