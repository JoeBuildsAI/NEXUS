import { describe, expect, it } from "vitest";
import { probeDirs } from "./useExternalGameWatch";

describe("external game probe", () => {
  it("probes only installed games with a real folder, deduplicated", () => {
    expect(probeDirs([
      { installed: true, installPath: "C:\\Steam\\steamapps\\common\\A" },
      { installed: true, installPath: "C:\\Steam\\steamapps\\common\\A" },
      { installed: false, installPath: "C:\\Steam\\steamapps\\common\\B" },
      { installed: true, installPath: null },
      { installed: true, installPath: "C:\\" },
    ])).toEqual(["C:\\Steam\\steamapps\\common\\A"]);
  });
});
