import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: "c" },
    ]);
  });

  it("returns all same for identical text", () => {
    expect(diffLines("a\nb", "a\nb").every((line) => line.type === "same")).toBe(true);
  });

  it("skips the matrix for very large inputs", () => {
    const left = Array.from({ length: 3000 }, (_, i) => `line-${i}`).join("\n");
    const out = diffLines(left, `${left}\nextra`);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("已跳过逐行差异");
  });
});
