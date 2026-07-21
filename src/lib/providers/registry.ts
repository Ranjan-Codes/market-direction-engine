import type { MarketDataProvider } from "./types";
import { PROVIDER_PRIORITY } from "../../config/providers";

/**
 * Provider registry with primary → fallback routing.
 *
 * Concrete providers (Stooq, yfinance, Alpha Vantage, Tiingo, …) register
 * here in Phase 1. Consumers ask the registry, never a vendor module, so
 * swapping or re-ordering sources is a config change.
 */
const marketDataProviders = new Map<string, MarketDataProvider>();

export function registerMarketDataProvider(p: MarketDataProvider): void {
  marketDataProviders.set(p.name, p);
}

/** Providers that can serve the given need, in configured priority order. */
export function getMarketDataProviders(
  need: keyof MarketDataProvider["capabilities"],
): MarketDataProvider[] {
  return PROVIDER_PRIORITY.marketData
    .map((name) => marketDataProviders.get(name))
    .filter((p): p is MarketDataProvider => !!p && p.capabilities[need]);
}
