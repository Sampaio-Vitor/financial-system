import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonthPicker from "@/components/month-picker";

const FROZEN = new Date("2026-05-07T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
});
afterEach(() => vi.useRealTimers());

describe("MonthPicker", () => {
  it("renders the year and 12 month buttons", () => {
    render(
      <MonthPicker month="2026-05" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText("2026")).toBeInTheDocument();
    ["Jan", "Fev", "Mar", "Mai", "Dez"].forEach((m) =>
      expect(screen.getByText(m)).toBeInTheDocument(),
    );
  });

  it("disables months past the current month", () => {
    render(
      <MonthPicker month="2026-05" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByText("Jun")).toBeDisabled();
    expect(screen.getByText("Mai")).not.toBeDisabled();
  });

  it("disables months before minMonth", () => {
    render(
      <MonthPicker
        month="2026-05"
        minMonth="2026-03"
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Fev")).toBeDisabled();
    expect(screen.getByText("Mar")).not.toBeDisabled();
  });

  it("calls onChange and onClose when a month is selected", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <MonthPicker
        month="2026-05"
        onChange={onChange}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByText("Mar"));
    expect(onChange).toHaveBeenCalledWith("2026-03");
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores clicks on disabled months", async () => {
    const onChange = vi.fn();
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <MonthPicker month="2026-05" onChange={onChange} onClose={() => {}} />,
    );
    await user.click(screen.getByText("Jun"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("year navigation respects bounds", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <MonthPicker
        month="2026-05"
        minMonth="2025-01"
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    const [prev, next] = screen.getAllByRole("button").slice(0, 2);
    expect(next).toBeDisabled(); // already at currentYear=2026
    await user.click(prev);
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(prev).toBeDisabled();
  });

  it("invokes onClose when clicking outside", () => {
    const onClose = vi.fn();
    render(
      <div>
        <span data-testid="outside">click</span>
        <MonthPicker month="2026-05" onChange={() => {}} onClose={onClose} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalled();
  });
});
