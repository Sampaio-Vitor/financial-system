import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatCurrency,
  formatEditableNumber,
  formatPercent,
  formatQuantity,
  formatUSD,
  getCurrentMonth,
  getMonthLabel,
  getNextMonth,
  getPrevMonth,
} from "@/lib/format";

describe("formatBRL", () => {
  it("renders em-dash for null/undefined/NaN", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
    expect(formatBRL(Number.NaN)).toBe("—");
  });

  it("formats with R$ and pt-BR thousands", () => {
    const out = formatBRL(1234.5);
    expect(out).toContain("R$");
    expect(out).toContain("1.234,50");
  });
});

describe("formatUSD", () => {
  it("renders em-dash for null", () => {
    expect(formatUSD(null)).toBe("—");
  });
  it("formats with $", () => {
    expect(formatUSD(10)).toMatch(/^\$10\.00$/);
  });
});

describe("formatCurrency", () => {
  it("delegates BRL/USD", () => {
    expect(formatCurrency(1, "BRL")).toContain("R$");
    expect(formatCurrency(1, "USD")).toContain("$");
  });
  it("formats EUR with de-DE", () => {
    const out = formatCurrency(1234.5, "EUR");
    expect(out).toContain("€");
  });
  it("formats GBP", () => {
    expect(formatCurrency(10, "GBP")).toContain("£");
  });
  it("renders em-dash for null non-BRL/USD", () => {
    expect(formatCurrency(null, "EUR")).toBe("—");
    expect(formatCurrency(Number.NaN, "EUR")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formats with sign and two decimals", () => {
    expect(formatPercent(12.345)).toBe("+12.35%");
    expect(formatPercent(-3.1)).toBe("-3.10%");
    expect(formatPercent(0)).toBe("+0.00%");
  });
  it("returns em-dash for invalid", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatQuantity", () => {
  it("uses pt-BR with up to 8 decimals", () => {
    expect(formatQuantity(1234.5)).toBe("1.234,5");
    expect(formatQuantity(null)).toBe("—");
  });
});

describe("formatEditableNumber", () => {
  it("returns empty string for null/undefined", () => {
    expect(formatEditableNumber(null)).toBe("");
    expect(formatEditableNumber(undefined)).toBe("");
  });
  it("trims trailing zeros", () => {
    expect(formatEditableNumber(1.5)).toBe("1.5");
    expect(formatEditableNumber(2)).toBe("2");
    expect(formatEditableNumber(0.0001)).toBe("0.0001");
  });
  it("returns empty string for non-finite", () => {
    expect(formatEditableNumber(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("getMonthLabel", () => {
  it("renders Portuguese month names", () => {
    expect(getMonthLabel("2026-01")).toBe("Janeiro de 2026");
    expect(getMonthLabel("2026-12")).toBe("Dezembro de 2026");
  });
});

describe("getPrevMonth / getNextMonth", () => {
  it("wraps year boundaries", () => {
    expect(getPrevMonth("2026-01")).toBe("2025-12");
    expect(getNextMonth("2026-12")).toBe("2027-01");
  });
  it("handles mid-year months", () => {
    expect(getPrevMonth("2026-05")).toBe("2026-04");
    expect(getNextMonth("2026-05")).toBe("2026-06");
  });
});

describe("getCurrentMonth", () => {
  it("returns YYYY-MM matching now()", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(getCurrentMonth()).toBe(expected);
  });
});
