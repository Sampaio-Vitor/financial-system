export type AssetType = "STOCK" | "ACAO" | "FII" | "RF";

export interface Asset {
  id: number;
  ticker: string;
  type: AssetType;
  description: string;
  paused: boolean;
  current_price: number | null;
  price_updated_at: string | null;
  created_at: string;
}

export interface AssetRebalancingInfo {
  asset_id: number;
  ticker: string;
  target_value: number;
  current_value: number;
  gap: number;
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

export interface FixedIncomeRedemption {
  id: number;
  fixed_income_id: number | null;
  ticker: string;
  description: string;
  redemption_date: string;
  amount: number;
}

export interface ClassSummary {
  asset_class: AssetType;
  label: string;
  value: number;
  pct: number;
  target_pct: number;
  gap: number;
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

export interface FixedIncomeInterest {
  id: number;
  fixed_income_id: number | null;
  ticker: string;
  description: string;
  reference_month: string;
  previous_balance: number;
  new_balance: number;
  interest_amount: number;
  created_at: string;
}

export interface FixedIncomeTransactionItem {
  ticker: string;
  description: string;
  date: string;
  amount: number;
}

export interface MonthlyOverview {
  month: string;
  min_month: string | null;
  patrimonio_total: number;
  reserva_financeira: number | null;
  reserva_target: number | null;
  total_invested: number;
  aportes_do_mes: number;
  resgates_do_mes: number;
  variacao_mes: number;
  variacao_mes_pct: number;
  allocation_breakdown: ClassSummary[];
  transactions: Purchase[];
  fi_aportes: FixedIncomeTransactionItem[];
  fi_redemptions: FixedIncomeTransactionItem[];
  fi_interest: FixedIncomeTransactionItem[];
  reserva_depositos: number;
  reserva_resgates: number;
}

export interface PositionItem {
  asset_id: number;
  ticker: string;
  description: string;
  type: AssetType;
  first_date: string | null;
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

export interface SnapshotResponse {
  id: number;
  month: string;
  total_patrimonio: number;
  total_invested: number;
  total_pnl: number;
  pnl_pct: number;
  aportes_do_mes: number;
  allocation_breakdown: unknown;
  snapshot_at: string;
}

export interface SnapshotAssetItem {
  ticker: string;
  type: AssetType;
  quantity: number;
  avg_price: number;
  closing_price: number | null;
  market_value: number | null;
  total_cost: number;
  pnl: number | null;
  pnl_pct: number | null;
}

export interface PatrimonioEvolutionPoint {
  month: string;
  total_patrimonio: number;
  total_invested: number;
  total_pnl: number;
  pnl_pct: number;
}

export interface BulkAssetCreated {
  ticker: string;
  type: AssetType;
}

export interface BulkAssetLinked {
  ticker: string;
  type: AssetType;
}

export interface BulkAssetSkipped {
  ticker: string;
  reason: string;
}

export interface BulkAssetResponse {
  created: BulkAssetCreated[];
  linked: BulkAssetLinked[];
  skipped: BulkAssetSkipped[];
}
