export type AssetType = "STOCK" | "ACAO" | "FII" | "RF";
export type AssetClass = "STOCK" | "ETF" | "FII" | "RF";
export type Market = "BR" | "US" | "EU" | "UK";
export type CurrencyCode = "BRL" | "USD" | "EUR" | "GBP";
export type AllocationBucket =
  | "STOCK_BR"
  | "STOCK_US"
  | "ETF_INTL"
  | "FII"
  | "RF";

export interface Asset {
  id: number;
  ticker: string;
  type: AssetType;
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
  description: string;
  paused: boolean;
  price_symbol?: string | null;
  current_price: number | null;
  current_price_native?: number | null;
  fx_rate_to_brl?: number | null;
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
  trade_currency: CurrencyCode;
  unit_price: number;
  total_value: number;
  unit_price_native: number;
  total_value_native: number;
  fx_rate: number;
  created_at: string;
  ticker?: string;
  asset_type?: AssetType;
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
}

export interface PurchasePageResponse {
  items: Purchase[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  total_value: number;
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
  asset_class?: AssetType | null;
  allocation_bucket?: AllocationBucket | null;
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
  proventos_do_mes: number;
  dividend_events: DividendEvent[];
}

export interface PositionItem {
  asset_id: number;
  ticker: string;
  description: string;
  type: AssetType;
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
  first_date: string | null;
  quantity: number;
  total_cost: number;
  avg_price: number;
  current_price: number | null;
  current_price_native?: number | null;
  fx_rate_to_brl?: number | null;
  market_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
}

export interface PositionsResponse {
  asset_class: AssetType;
  asset_class_v2?: AssetClass | null;
  market?: Market | null;
  allocation_bucket?: AllocationBucket | null;
  positions: PositionItem[];
  total_cost: number;
  total_market_value: number;
  total_pnl: number;
  total_pnl_pct: number | null;
}

export interface AllocationTarget {
  allocation_bucket: AllocationBucket;
  target_pct: number;
}

export interface ClassRebalancing {
  allocation_bucket: AllocationBucket;
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
  asset_class: AssetClass;
  market: Market;
  quote_currency: CurrencyCode;
  allocation_bucket: AllocationBucket;
  current_value: number;
  target_value: number;
  gap: number;
  gap_pct: number;
  amount_to_invest: number;
  amount_to_invest_usd: number | null;
  amount_to_invest_native?: number | null;
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

export interface PriceContextResponse {
  usd_brl_rate: number | null;
  eur_brl_rate?: number | null;
  gbp_brl_rate?: number | null;
  rate_updated_at: string | null;
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
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
  allocation_bucket?: AllocationBucket | null;
  quantity: number;
  avg_price: number;
  avg_price_native?: number | null;
  closing_price: number | null;
  closing_price_native?: number | null;
  fx_rate_to_brl?: number | null;
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

export interface DailyEvolutionPoint {
  date: string;
  total_patrimonio: number;
  total_invested: number;
  total_pnl: number;
  pnl_pct: number;
}

export interface PriceStatusResponse {
  next_run_utc: string;
  last_run_utc: string | null;
  last_run_status: string | null;
}

export interface BulkAssetCreated {
  ticker: string;
  type?: AssetType | null;
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
}

export interface BulkAssetLinked {
  ticker: string;
  type?: AssetType | null;
  asset_class?: AssetClass | null;
  market?: Market | null;
  quote_currency?: CurrencyCode | null;
}

export interface BastterSyncPreviewItem {
  id: number;
  ticker: string;
  asset_type: AssetType;
  asset_class?: AssetClass | null;
  market?: Market | null;
  purchase_date: string;
  quantity: number;
  total_value: number;
  total_value_native: number;
  trade_currency: CurrencyCode;
  bastter_synced_at: string | null;
}

export interface BastterSyncPreviewResponse {
  items: BastterSyncPreviewItem[];
  total_count: number;
}

export interface BastterSyncItemResult {
  purchase_id: number;
  ticker: string;
  local_type: string;
  asset_class?: AssetClass | null;
  market?: Market | null;
  bastter_tipo: string;
  ativo_id: number | null;
  endpoint: string | null;
  payload: Record<string, unknown> | null;
  success: boolean;
  bastter_response: Record<string, unknown> | null;
  error: string | null;
  bastter_synced_at: string | null;
}

export interface BastterSyncBatchResponse {
  catalog_items_count: number;
  selected_count: number;
  success_count: number;
  failure_count: number;
  results: BastterSyncItemResult[];
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

// --- Expenses / Pluggy ---

export interface BankAccount {
  id: number;
  name: string;
  type: "checking" | "savings" | "credit_card";
  balance: number;
  currency: string;
}

export interface BankConnection {
  id: number;
  institution_name: string;
  status: "active" | "error" | "expired";
  last_sync_at: string | null;
  created_at: string;
  accounts: BankAccount[];
}

export interface ExpenseTransaction {
  id: number;
  account_id: number;
  description: string;
  payee: string | null;
  amount: number;
  date: string;
  type: "debit" | "credit";
  category: string;
  pluggy_category: string | null;
  status: "posted" | "pending";
  created_at: string;
}

export interface TransactionSummaryItem {
  category: string;
  total: number;
  count: number;
}

export interface TransactionSummary {
  month: string;
  total_expenses: number;
  total_income: number;
  categories: TransactionSummaryItem[];
}

export interface TransactionListResponse {
  transactions: ExpenseTransaction[];
  total_count: number;
}

// --- Dividend Events ---

export interface DividendEvent {
  id: number;
  transaction_id: number;
  asset_id: number | null;
  ticker: string | null;
  asset_type: string | null;
  event_type: string;
  credited_amount: number;
  gross_amount: number | null;
  withholding_tax: number | null;
  quantity_base: number | null;
  amount_per_unit: number | null;
  payment_date: string;
  description: string;
  source_category: string | null;
  source_confidence: string;
  created_at: string;
}

export interface DividendEventListResponse {
  events: DividendEvent[];
  total_count: number;
}

// --- Saved Plans ---

export interface SavedPlanItem {
  id: number;
  ticker: string;
  asset_class: string;
  current_value: number;
  target_value: number;
  gap: number;
  amount_to_invest: number;
  amount_to_invest_usd: number | null;
  amount_to_invest_native?: number | null;
  quote_currency?: CurrencyCode | null;
  is_reserve: boolean;
  checked: boolean;
}

export interface SavedPlan {
  id: number;
  label: string;
  contribution: number;
  patrimonio_atual: number;
  patrimonio_pos_aporte: number;
  reserva_valor: number;
  reserva_target: number | null;
  reserva_gap: number | null;
  total_planned: number;
  class_breakdown_json: string;
  created_at: string;
  items: SavedPlanItem[];
}

export interface SavedPlanSummary {
  id: number;
  label: string;
  contribution: number;
  total_planned: number;
  created_at: string;
  items_count: number;
  checked_count: number;
}
