import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExactCodeMatch,
  matchesBrand,
  normalizeCode,
  stripPackSuffix,
} from "../src/providers/lubaires/index.js";

describe("lubaires match", () => {
  it("acepta MANN FILTER como marca MANN", () => {
    assert.equal(matchesBrand("MANN", "MANN"), true);
    assert.equal(matchesBrand("MANN FILTER", "MANN"), true);
    assert.equal(matchesBrand("MANN-FILTER", "MANN"), true);
    assert.equal(matchesBrand("WIX", "MANN"), false);
  });

  it("matchea C2295/2 aunque Lubaires muestre (10)", () => {
    assert.equal(stripPackSuffix("C 2295/2 (10)"), "C 2295/2");
    assert.equal(normalizeCode("C 2295/2 (10)"), "C22952");
    assert.equal(isExactCodeMatch("C 2295/2 (10)", "C2295/2"), true);
    assert.equal(isExactCodeMatch("C 2295/2", "C2295/2"), true);
  });
});
