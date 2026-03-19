export type AssetType = "STOCK" | "ACAO" | "FII" | "RF";

export interface Asset {
  id: number;
  ticker: string;
  type: AssetType;
  description: string;
  current_price: number | null;
  price_updated_at: string | null;
  created_at: string;
}

export interface Purchase {
  id: number;
  asset_id: number;
  purchase_date: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  created_at: string;
  ticker?: string;
  asset_type?: AssetType;
}

export interface FixedIncomePosition {
  id: number;
  asset_id: number;
  description: string;
  start_date: string;
  applied_value: number;
  current_balance: number;
  yield_value: number;
  yield_pct: number;
  maturity_date: string | null;
  created_at: string;
  updated_at: string;
  ticker?: string;
}

export interface ClassSummary {
  asset_class: AssetType;
  label: string;
  value: number;
  pct: number;
  target_pct: number;
  gap: number;
}

export interface DailyPatrimonio {
  day: number;
  value: number;
}

export interface FinancialReserveEntry {
  id: number;
  amount: number;
  note: string | null;
  recorded_at: string;
}

export interface FinancialReserveMonthValue {
  month: string;
  amount: number | null;
  entry: FinancialReserveEntry | null;
}

export interface FinancialReserveTarget {
  target_amount: number | null;
}

export interface MonthlyOverview {
  month: string;
  min_month: string | null;
  patrimonio_total: number;
  reserva_financeira: number | null;
  reserva_target: number | null;
  total_invested: number;
  aportes_do_mes: number;
  variacao_mes: number;
  variacao_mes_pct: number;
  allocation_breakdown: ClassSummary[];
  daily_patrimonio: DailyPatrimonio[];
  transactions: Purchase[];
}

export interface PositionItem {
  asset_id: number;
  ticker: string;
  description: string;
  type: AssetType;
  quantity: number;
  total_cost: number;
  avg_price: number;
  current_price: number | null;
  market_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
}

export interface PositionsResponse {
  asset_class: AssetType;
  positions: PositionItem[];
  total_cost: number;
  total_market_value: number;
  total_pnl: number;
  total_pnl_pct: number | null;
}

export interface AllocationTarget {
  asset_class: AssetType;
  target_pct: number;
}

export interface ClassRebalancing {
  asset_class: AssetType;
  label: string;
  target_pct: number;
  current_pct: number;
  current_value: number;
  target_value: number;
  gap: number;
  gap_pct: number;
  status: string;
}

export interface AssetRebalancing {
  ticker: string;
  asset_class: AssetType;
  current_value: number;
  target_value: number;
  gap: number;
  gap_pct: number;
  amount_to_invest: number;
  amount_to_invest_usd: number | null;
}

export interface RebalancingResponse {
  contribution: number;
  patrimonio_atual: number;
  patrimonio_pos_aporte: number;
  reserva_valor: number;
  reserva_target: number | null;
  reserva_gap: number | null;
  class_breakdown: ClassRebalancing[];
  asset_plan: AssetRebalancing[];
  total_planned: number;
}

export interface PriceUpdateResult {
  updated: { ticker: string; price: number }[];
  failed: { ticker: string; error: string }[];
  usd_brl_rate: number | null;
}
