import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingRow, Select } from "./SettingsControls";
import { Toggle } from "@/components/ui";

describe("settings controls accessibility", () => {
  it("a switch or segmented control inside a SettingRow is named by the row label", () => {
    render(
      <>
        <SettingRow label="Allow process management"><Toggle checked={false} onChange={() => undefined} /></SettingRow>
        <SettingRow label="System safety mode"><Select value="a" onChange={() => undefined} options={[{ value: "a", label: "Observe only" }, { value: "b", label: "Enabled" }]} /></SettingRow>
      </>,
    );
    expect(screen.getByRole("switch", { name: "Allow process management" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "System safety mode" })).toBeInTheDocument();
  });

  it("an explicit toggle label wins over the row label", () => {
    render(<SettingRow label="Row"><Toggle label="Own label" checked onChange={() => undefined} /></SettingRow>);
    expect(screen.getByRole("switch", { name: "Own label" })).toBeInTheDocument();
  });
});
