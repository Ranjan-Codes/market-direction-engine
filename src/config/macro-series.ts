/**
 * Macro series universe (Layer 1C inputs + backdrop). All FRED in v1 —
 * FRED mirrors the key UK series, so ONS/BoE direct ingestion is deferred
 * until a series is needed that FRED lacks.
 *
 * lead_lag tags drive the leading/coincident/lagging labels in the UI.
 */
export interface MacroSeriesConfig {
  seriesCode: string; // our canonical code, "fred:" prefix + FRED id
  fredId: string;
  name: string;
  country: "US" | "UK" | "GLOBAL";
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  units: string;
  leadLag: "leading" | "coincident" | "lagging";
}

export const MACRO_SERIES: MacroSeriesConfig[] = [
  // Yield curve — classic recession leads
  { seriesCode: "fred:T10Y2Y", fredId: "T10Y2Y", name: "10Y-2Y Treasury Spread", country: "US", frequency: "daily", units: "%", leadLag: "leading" },
  { seriesCode: "fred:T10Y3M", fredId: "T10Y3M", name: "10Y-3M Treasury Spread", country: "US", frequency: "daily", units: "%", leadLag: "leading" },
  { seriesCode: "fred:DGS2", fredId: "DGS2", name: "2-Year Treasury Yield", country: "US", frequency: "daily", units: "%", leadLag: "coincident" },
  { seriesCode: "fred:DGS10", fredId: "DGS10", name: "10-Year Treasury Yield", country: "US", frequency: "daily", units: "%", leadLag: "coincident" },
  // Credit spreads — risk-appetite leads
  { seriesCode: "fred:BAMLH0A0HYM2", fredId: "BAMLH0A0HYM2", name: "US High Yield OAS", country: "US", frequency: "daily", units: "%", leadLag: "leading" },
  { seriesCode: "fred:BAMLC0A0CM", fredId: "BAMLC0A0CM", name: "US Investment Grade OAS", country: "US", frequency: "daily", units: "%", leadLag: "leading" },
  // Policy
  { seriesCode: "fred:DFF", fredId: "DFF", name: "Fed Funds Effective Rate", country: "US", frequency: "daily", units: "%", leadLag: "coincident" },
  { seriesCode: "fred:IUDSOIA", fredId: "IUDSOIA", name: "SONIA Overnight Rate", country: "UK", frequency: "daily", units: "%", leadLag: "coincident" },
  // Growth / labour
  { seriesCode: "fred:ICSA", fredId: "ICSA", name: "Initial Jobless Claims", country: "US", frequency: "weekly", units: "count", leadLag: "leading" },
  { seriesCode: "fred:PAYEMS", fredId: "PAYEMS", name: "Nonfarm Payrolls", country: "US", frequency: "monthly", units: "thousands", leadLag: "coincident" },
  { seriesCode: "fred:UNRATE", fredId: "UNRATE", name: "US Unemployment Rate", country: "US", frequency: "monthly", units: "%", leadLag: "lagging" },
  { seriesCode: "fred:PERMIT", fredId: "PERMIT", name: "Building Permits", country: "US", frequency: "monthly", units: "thousands", leadLag: "leading" },
  { seriesCode: "fred:UMCSENT", fredId: "UMCSENT", name: "U. Michigan Consumer Sentiment", country: "US", frequency: "monthly", units: "index", leadLag: "leading" },
  // Inflation
  { seriesCode: "fred:CPIAUCSL", fredId: "CPIAUCSL", name: "US CPI (All Urban)", country: "US", frequency: "monthly", units: "index", leadLag: "lagging" },
  { seriesCode: "fred:GBRCPIALLMINMEI", fredId: "GBRCPIALLMINMEI", name: "UK CPI", country: "UK", frequency: "monthly", units: "index", leadLag: "lagging" },
  // UK activity
  { seriesCode: "fred:LRHUTTTTGBM156S", fredId: "LRHUTTTTGBM156S", name: "UK Unemployment Rate", country: "UK", frequency: "monthly", units: "%", leadLag: "lagging" },
  { seriesCode: "fred:IRLTLT01GBM156N", fredId: "IRLTLT01GBM156N", name: "UK 10Y Gilt Yield", country: "UK", frequency: "monthly", units: "%", leadLag: "coincident" },
];
