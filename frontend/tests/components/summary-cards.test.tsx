import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SummaryCards from "@/components/summary-cards";

describe("SummaryCards", () => {
  it("renders BRL and percent formatted values", () => {
    render(
      <SummaryCards
        cards={[
          { label: "Patrimônio", value: 1000, format: "brl" },
          { label: "Variação", value: 5.5, format: "percent", colorBySign: true },
        ]}
        expandedCard={null}
        onToggleCard={() => {}}
      />,
    );
    expect(screen.getByText("Patrimônio")).toBeInTheDocument();
    expect(screen.getByText(/1\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("+5.50%")).toBeInTheDocument();
  });

  it("toggle handler fires on expandable cards", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <SummaryCards
        cards={[
          { label: "Detalhes", value: 0, format: "brl", expandable: true },
        ]}
        expandedCard={null}
        onToggleCard={onToggle}
      />,
    );
    await user.click(screen.getByText("Detalhes"));
    expect(onToggle).toHaveBeenCalledWith("Detalhes");
  });

  it("color-by-sign uses positive class for positive values", () => {
    render(
      <SummaryCards
        cards={[{ label: "G", value: 10, format: "percent", colorBySign: true }]}
        expandedCard={null}
        onToggleCard={() => {}}
      />,
    );
    const value = screen.getByText("+10.00%");
    expect(value.className).toContain("color-positive");
  });

  it("color-by-sign uses negative class for negative values", () => {
    render(
      <SummaryCards
        cards={[{ label: "G", value: -1, format: "percent", colorBySign: true }]}
        expandedCard={null}
        onToggleCard={() => {}}
      />,
    );
    expect(screen.getByText("-1.00%").className).toContain("color-negative");
  });

  it("color-by-sign uses primary class when zero", () => {
    render(
      <SummaryCards
        cards={[{ label: "G", value: 0, format: "percent", colorBySign: true }]}
        expandedCard={null}
        onToggleCard={() => {}}
      />,
    );
    expect(screen.getByText("+0.00%").className).toContain("color-text-primary");
  });

  it("does not bind onClick when not expandable", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <SummaryCards
        cards={[{ label: "Static", value: 0, format: "brl" }]}
        expandedCard={null}
        onToggleCard={onToggle}
      />,
    );
    await user.click(screen.getByText("Static"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
