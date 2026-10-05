import { describe, expect, it } from "vitest";
import { readableOnTheme } from "./color";

describe("readableOnTheme", () => {
  it("keeps colours untouched on the light theme", () => {
    expect(readableOnTheme("#0000FF", false)).toBe("#0000FF");
  });
  it("lightens dark saturated colours on the dark theme", () => {
    expect(readableOnTheme("#0000FF", true)).toBe("rgb(140, 140, 255)");
    expect(readableOnTheme("FF1F3864", true)).toMatch(/^rgb\(/);
  });
  it("drops near-black greys to the default text colour", () => {
    expect(readableOnTheme("#0f172a", true)).toBeUndefined();
  });
  it("keeps already-light colours", () => {
    expect(readableOnTheme("#ffd166", true)).toBe("#ffd166");
  });
});
