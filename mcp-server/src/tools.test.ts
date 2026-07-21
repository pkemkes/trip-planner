import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REGISTERED_TOOL_NAMES } from "./tools.js";

describe("C7: map deletion is not registered", () => {
  it("does not expose any delete_map tool", () => {
    assert.ok(!REGISTERED_TOOL_NAMES.includes("delete_map" as never));
  });

  it("registers exactly the expected 11 tools", () => {
    assert.equal(REGISTERED_TOOL_NAMES.length, 11);
    assert.deepEqual(
      [...REGISTERED_TOOL_NAMES].sort(),
      [
        "create_map",
        "create_pin",
        "create_zone",
        "delete_pin",
        "delete_zone",
        "get_map_summary",
        "list_maps",
        "list_pins",
        "list_zones",
        "update_pin",
        "update_zone",
      ]
    );
  });
});
