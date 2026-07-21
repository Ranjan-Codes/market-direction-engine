"use client";

import { useEffect, useRef } from "react";
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, type IChartApi,
} from "lightweight-charts";

interface Bar {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
interface Snap {
  week_end: string;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_upper: number | null;
  bb_mid: number | null;
  bb_lower: number | null;
  ma_30w: number | null;
  ma_40w: number | null;
}

export function StockChart({ bars, snapshots }: { bars: Bar[]; snapshots: Snap[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart: IChartApi = createChart(ref.current, {
      height: 560,
      layout: { background: { color: "#09090b" }, textColor: "#a1a1aa", panes: { separatorColor: "#27272a" } },
      grid: { vertLines: { color: "#18181b" }, horzLines: { color: "#18181b" } },
      timeScale: { borderColor: "#3f3f46" },
      rightPriceScale: { borderColor: "#3f3f46" },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a", downColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626", borderVisible: false,
    });
    candles.setData(
      bars
        .filter((b) => b.open != null && b.close != null && b.high != null && b.low != null)
        .map((b) => ({ time: b.time, open: b.open!, high: b.high!, low: b.low!, close: b.close! })),
    );

    const line = (color: string, data: Array<{ time: string; value: number }>, pane = 0, width: 1 | 2 = 1) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false }, pane);
      s.setData(data);
      return s;
    };
    const pick = (key: keyof Snap) =>
      snapshots
        .filter((s) => s[key] != null)
        .map((s) => ({ time: s.week_end, value: s[key] as number }));

    line("#818cf8", pick("bb_upper"));
    line("#52525b", pick("bb_mid"));
    line("#818cf8", pick("bb_lower"));
    line("#eab308", pick("ma_30w"), 0, 2);
    line("#f97316", pick("ma_40w"), 0, 2);

    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol", color: "#3f3f46", priceLineVisible: false, lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(bars.filter((b) => b.volume != null).map((b) => ({ time: b.time, value: b.volume! })));

    line("#38bdf8", pick("rsi_14"), 1, 2);
    const macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2);
    macdHist.setData(
      snapshots
        .filter((s) => s.macd_hist != null)
        .map((s) => ({ time: s.week_end, value: s.macd_hist!, color: s.macd_hist! >= 0 ? "#16a34a" : "#dc2626" })),
    );
    line("#e4e4e7", pick("macd"), 2);
    line("#f59e0b", pick("macd_signal"), 2);

    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(90);
    if (panes[2]) panes[2].setHeight(90);
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 800 });
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [bars, snapshots]);

  return <div ref={ref} className="w-full" />;
}
