# ADR-004: Parent is stored only on the child

Children are a query over `parent_id`, avoiding duplicated hierarchy state.
