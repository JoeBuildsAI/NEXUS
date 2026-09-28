import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoHideControls } from "./useAutoHideControls";

describe("useAutoHideControls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays visible when inactive (normal mode)", () => {
    const { result } = renderHook(() => useAutoHideControls(false, 1000));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(true);
  });

  it("hides after the inactivity window when active, and reveal resets it", () => {
    const { result } = renderHook(() => useAutoHideControls(true, 1000));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.visible).toBe(false);
    act(() => result.current.reveal());
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.visible).toBe(true); // still within the window
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.visible).toBe(false);
  });

  it("holding keeps controls visible until released", () => {
    const { result } = renderHook(() => useAutoHideControls(true, 1000));
    act(() => result.current.hold(true));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.visible).toBe(true); // held open (pointer over controls)
    act(() => result.current.hold(false));
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.visible).toBe(false);
  });
});
