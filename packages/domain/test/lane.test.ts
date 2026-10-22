import { describe, expect, it } from "vitest";

import { FREE_LANES, LANE_CAPACITY, LANE_PAYS, PAID_LANES, RESOURCE_LANES, laneOfSlot, laneSlots } from "../src/lane.ts";

// Decision 5 (capacity) and decision 6 (which lanes hold on a crash) as data.
describe("lane capacity and slots", () => {
  it("every lane has a positive capacity and that many slots, named <lane>#<i>", () => {
    for (const l of RESOURCE_LANES) {
      expect(LANE_CAPACITY[l]).toBeGreaterThan(0);
      expect(laneSlots(l)).toEqual(Array.from({ length: LANE_CAPACITY[l] }, (_, i) => `${l}#${i + 1}`));
    }
    expect(laneSlots("seat.text")).toEqual(["seat.text#1", "seat.text#2", "seat.text#3", "seat.text#4"]);
  });
  it("a slot names its lane; anything else names none", () => {
    expect(laneOfSlot("cloud.google#3")).toBe("cloud.google");
    expect(laneOfSlot("gpu.local")).toBe("gpu.local");
    expect(laneOfSlot("gpu.remote#1")).toBeUndefined();
    expect(laneOfSlot("reservation")).toBeUndefined();
  });
});

describe("paid and free lanes", () => {
  it("the local GPU, the render box and Blender are free; Chrome, the seat and every cloud pay", () => {
    expect(FREE_LANES).toEqual(["gpu.local", "box.render", "box.blender"]);
    expect(PAID_LANES).toEqual(["box.chrome", "seat.text", "cloud.google", "cloud.elevenlabs", "cloud.leonardo", "cloud.qwen"]);
    for (const l of RESOURCE_LANES) expect(PAID_LANES.includes(l)).toBe(LANE_PAYS[l]);
  });
});
