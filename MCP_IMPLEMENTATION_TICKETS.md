# MCP Server Implementation Tickets

This ticket plan implements the requirements captured in MCP_SERVER_FEATURE_SPEC.md.

## Delivery Plan

1. Epic A: Backend data model and API foundation
2. Epic B: MCP server scaffold and map tools
3. Epic C: Pin and zone mutation tools with soft delete
4. Epic D: Quality, testing, and docs
5. Epic E: Future-ready auth track (design-only for now)

## Priority and Milestones

1. Milestone 1 (MVP): A1-A6, B1-B4, C1-C7, D1
2. Milestone 2 (Hardening): A7-A8, D2-D5
3. Milestone 3 (Future Auth Design): E1-E3

## Epic A: Backend Data Model and API Foundation

### A1. Add stable IDs and soft-delete metadata to pins and zones

- Type: Backend
- Priority: P0
- Dependencies: None
- Description:
  - Extend pin and zone objects with id, source, isDeleted, deletedAt, deletedBy.
  - Ensure shape supports both default and user entities.
- Acceptance criteria:
  - Existing map rows are readable after change.
  - New entities always receive UUID id.
  - New entities default to isDeleted false and deletedAt/deletedBy null.

### A2. Implement migration and backfill strategy for existing map rows

- Type: Backend
- Priority: P0
- Dependencies: A1
- Description:
  - On read or update, backfill missing id and soft-delete metadata.
  - Tag source as default for seeded data and user for created data.
- Acceptance criteria:
  - Legacy rows are upgraded without manual reset.
  - Backfill is idempotent and does not duplicate records.

### A3. Add map creation guardrails and validation

- Type: Backend
- Priority: P1
- Dependencies: None
- Description:
  - Validate map name for required and non-empty constraints.
  - Return consistent error payloads.
- Acceptance criteria:
  - Invalid map names fail with validation error format.
  - Valid map creation remains backward compatible with frontend.

### A4. Add entity-level pin endpoints

- Type: Backend
- Priority: P0
- Dependencies: A1, A2
- Description:
  - Implement GET /api/maps/:id/pins
  - Implement POST /api/maps/:id/pins
  - Implement PATCH /api/maps/:id/pins/:pinId
  - Implement DELETE /api/maps/:id/pins/:pinId as soft delete
- Acceptance criteria:
  - Endpoints operate by pin id only.
  - Delete marks isDeleted true and updates deletedAt.
  - Default and user pins are both editable and soft-deletable.

### A5. Add entity-level zone endpoints

- Type: Backend
- Priority: P0
- Dependencies: A1, A2
- Description:
  - Implement GET /api/maps/:id/zones
  - Implement POST /api/maps/:id/zones
  - Implement PATCH /api/maps/:id/zones/:zoneId
  - Implement DELETE /api/maps/:id/zones/:zoneId as soft delete
- Acceptance criteria:
  - Endpoints operate by zone id only.
  - Delete marks isDeleted true and updates deletedAt.
  - Default and user zones are both editable and soft-deletable.

### A6. Add includeDeleted filtering support

- Type: Backend
- Priority: P1
- Dependencies: A4, A5
- Description:
  - Support includeDeleted boolean on list pins and list zones.
  - Default list behavior returns active entities only.
- Acceptance criteria:
  - includeDeleted false returns only non-deleted entities.
  - includeDeleted true returns both active and deleted entities.

### A7. Add optimistic concurrency checks

- Type: Backend
- Priority: P1
- Dependencies: A4, A5
- Description:
  - Add version token or updated_at check for write operations.
  - Return conflict errors for stale writes.
- Acceptance criteria:
  - Concurrent write simulation returns conflict response.
  - No silent overwrite on stale update.

### A8. Standardize backend error contract

- Type: Backend
- Priority: P1
- Dependencies: A4, A5
- Description:
  - Normalize API error payloads with code, message, details.
  - Add ENTITY_DELETED behavior for invalid mutation of deleted entities.
- Acceptance criteria:
  - MAP_NOT_FOUND, PIN_NOT_FOUND, ZONE_NOT_FOUND, VALIDATION_ERROR, CONFLICT, BACKEND_UNAVAILABLE, ENTITY_DELETED are all reachable as documented.

## Epic B: MCP Server Scaffold and Map Tools

### B1. Create mcp-server package and runtime wiring

- Type: MCP
- Priority: P0
- Dependencies: None
- Description:
  - Create new workspace package mcp-server.
  - Add build, dev, and start scripts.
  - Add configurable backend base URL.
- Acceptance criteria:
  - MCP server starts locally and connects to backend.
  - Basic health log confirms tool registration.

### B2. Implement list_maps tool

- Type: MCP
- Priority: P0
- Dependencies: B1
- Description:
  - Add tool that fetches backend map list and returns id, name, updatedAt.
  - Ensure output is LLM-friendly and deterministic.
- Acceptance criteria:
  - Tool returns expected map list schema.
  - Backend errors map to MCP error format.

### B3. Implement create_map tool

- Type: MCP
- Priority: P0
- Dependencies: B1
- Description:
  - Add tool that creates map by name.
  - Return only the changed entity (the new map record).
- Acceptance criteria:
  - Valid input creates map.
  - Invalid input returns validation error.

### B4. Implement get_map_summary tool

- Type: MCP
- Priority: P1
- Dependencies: B1, A4, A5, A6
- Description:
  - Return map id, name, pinCount, zoneCount, updatedAt.
  - Count active entities by default.
- Acceptance criteria:
  - Summary aligns with backend state.
  - Missing map returns MAP_NOT_FOUND.

## Epic C: Pin and Zone Tools with Soft Delete

### C1. Implement list_pins tool

- Type: MCP
- Priority: P0
- Dependencies: B1, A4, A6
- Description:
  - Add list_pins with optional includeDeleted input.
  - Return stable ids and metadata fields.
- Acceptance criteria:
  - Default excludes deleted pins.
  - includeDeleted true includes deleted pins.

### C2. Implement create_pin and update_pin tools

- Type: MCP
- Priority: P0
- Dependencies: C1
- Description:
  - Add create and partial update by pin id.
  - Enforce category and coordinate validation.
  - Return only changed entity.
- Acceptance criteria:
  - create_pin returns created pin only.
  - update_pin returns updated pin only.

### C3. Implement delete_pin soft-delete tool

- Type: MCP
- Priority: P0
- Dependencies: C2
- Description:
  - Soft-delete pin by id.
  - Allow soft-delete on both default and user pins.
  - Return only changed entity.
- Acceptance criteria:
  - Returned entity shows isDeleted true with deletedAt.
  - Re-delete behavior is deterministic (idempotent or ENTITY_DELETED based on chosen API rule).

### C4. Implement list_zones tool

- Type: MCP
- Priority: P0
- Dependencies: B1, A5, A6
- Description:
  - Add list_zones with optional includeDeleted input.
  - Return stable ids and metadata fields.
- Acceptance criteria:
  - Default excludes deleted zones.
  - includeDeleted true includes deleted zones.

### C5. Implement create_zone and update_zone tools

- Type: MCP
- Priority: P0
- Dependencies: C4
- Description:
  - Add create and partial update by zone id.
  - Enforce category and minimum vertex rules.
  - Return only changed entity.
- Acceptance criteria:
  - create_zone returns created zone only.
  - update_zone returns updated zone only.

### C6. Implement delete_zone soft-delete tool

- Type: MCP
- Priority: P0
- Dependencies: C5
- Description:
  - Soft-delete zone by id.
  - Allow soft-delete on both default and user zones.
  - Return only changed entity.
- Acceptance criteria:
  - Returned entity shows isDeleted true with deletedAt.
  - Re-delete behavior is deterministic (idempotent or ENTITY_DELETED based on chosen API rule).

### C7. Enforce no map deletion in MCP tool registry

- Type: MCP
- Priority: P0
- Dependencies: B1
- Description:
  - Do not register delete_map tool.
  - Ensure map deletion endpoint cannot be reached through MCP wrappers.
- Acceptance criteria:
  - MCP capabilities list has no map deletion mutation.
  - Negative test confirms deletion attempt is rejected.

## Epic D: Quality, Testing, and Documentation

### D1. Add backend unit tests for validation and mutation logic

- Type: QA
- Priority: P0
- Dependencies: A4, A5, A8
- Description:
  - Cover UUID validation, categories, coordinates, soft-delete transitions.
  - Cover entity-not-found and entity-deleted behavior.
- Acceptance criteria:
  - Test suite passes with stable results.
  - Validation matrix is documented in test names.

### D2. Add backend integration tests for pin and zone lifecycle

- Type: QA
- Priority: P1
- Dependencies: D1
- Description:
  - End-to-end create, update, soft-delete, list (with and without includeDeleted).
- Acceptance criteria:
  - All CRUD paths pass for both pin and zone.
  - Both default and user entities are covered for edit/delete.

### D3. Add MCP integration tests against local backend

- Type: QA
- Priority: P1
- Dependencies: B2-B4, C1-C7
- Description:
  - Validate each MCP tool contract and error mapping.
  - Assert mutation tools return only changed entity.
- Acceptance criteria:
  - Tool outputs match documented schemas.
  - Error normalization is deterministic.

### D4. Add concurrency conflict tests

- Type: QA
- Priority: P1
- Dependencies: A7
- Description:
  - Simulate concurrent updates to same pin/zone.
  - Verify conflict handling and safe retry path.
- Acceptance criteria:
  - Stale writes fail with CONFLICT.
  - Fresh retries succeed.

### D5. Update project documentation for MCP setup and usage

- Type: Docs
- Priority: P1
- Dependencies: B1-B4, C1-C7
- Description:
  - Document package setup, env vars, run commands, tool contracts.
  - Document soft-delete behavior and includeDeleted semantics.
- Acceptance criteria:
  - New developer can run backend plus MCP and execute all tools.
  - Docs include clear limitations: no map deletion via MCP.

## Epic E: Future Auth Track (Design-Only)

### E1. Write auth architecture decision record

- Type: Design
- Priority: P2
- Dependencies: None
- Description:
  - Compare service token vs user OAuth for MCP.
  - Define app principal propagation strategy.
- Acceptance criteria:
  - Decision document approved.

### E2. Define authorization model for map and entity operations

- Type: Design
- Priority: P2
- Dependencies: E1
- Description:
  - Specify map-level permissions and role checks.
  - Define unauthorized and forbidden error mapping.
- Acceptance criteria:
  - Access matrix covers read, create, edit, soft-delete actions.

### E3. Plan audit field rollout for deletedBy and updatedBy

- Type: Design
- Priority: P2
- Dependencies: E1
- Description:
  - Define data and migration steps for authenticated actor tracking.
  - Keep compatibility with current null actor values.
- Acceptance criteria:
  - Backward-compatible migration plan documented.

## Suggested Sprint Packaging

1. Sprint 1: A1-A6, B1-B4, C1-C7, D1
2. Sprint 2: A7-A8, D2-D4
3. Sprint 3: D5, E1-E3

## Risks and Mitigations

1. Risk: Legacy data inconsistencies during migration.
   - Mitigation: Idempotent backfill and integration tests on seeded DB snapshots.
2. Risk: Race conditions under concurrent LLM writes.
   - Mitigation: Optimistic concurrency checks and explicit CONFLICT retry guidance.
3. Risk: Tool contract drift between backend and MCP.
   - Mitigation: Shared schema definitions and MCP integration tests in CI.
