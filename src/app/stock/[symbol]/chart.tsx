"use client";

import { useEffect, useRef } from "react";
import {
  createChart, createTextWatermark, CandlestickSeries, LineSeries, HistogramSeries,
  type IChartApi,
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
      layout: { background: { color: "#ffffff" }, textColor: "#52525b", panes: { separatorColor: "#e4e4e7" } },
      grid: { vertLines: { color: "#f4f4f5" }, horzLines: { color: "#f4f4f5" } },
      timeScale: { borderColor: "#d4d4d8" },
      rightPriceScale: { borderColor: "#d4d4d8" },
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
      priceScaleId: "vol", color: "#d4d4d8", priceLineVisible: false, lastValueVisible: false,
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
    line("#3f3f46", pick("macd"), 2);
    line("#f59e0b", pick("macd_signal"), 2);

    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(90);
    if (panes[2]) panes[2].setHeight(90);
    // Label each pane so there's no guessing which line is what.
    const label = (pane: number, text: string) => {
      if (panes[pane]) {
        createTextWatermark(panes[pane], {
          horzAlign: "left",
          vertAlign: "top",
          lines: [{ text, color: "#a1a1aa", fontSize: 12 }],
        });
      }
    };
    label(0, "Price (weekly) · grey bars = volume");
    label(1, "RSI (14) — above 70 overbought, below 30 oversold");
    label(2, "MACD — green/red bars = momentum, orange = signal line");
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: ref.current?.clientWidth ?? 800 });
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [bars, snapshots]);

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 mb-2">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600 align-middle mr-1" />up week</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600 align-middle mr-1" />down week</span>
        <span><span className="inline-block w-4 h-0.5 bg-yellow-500 align-middle mr-1" />30-week avg</span>
        <span><span className="inline-block w-4 h-0.5 bg-orange-500 align-middle mr-1" />40-week avg</span>
        <span><span className="inline-block w-4 h-0.5 bg-indigo-400 align-middle mr-1" />Bollinger bands</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-300 align-middle mr-1" />volume</span>
        <span><span className="inline-block w-4 h-0.5 bg-sky-400 align-middle mr-1" />RSI</span>
        <span><span className="inline-block w-4 h-0.5 bg-amber-500 align-middle mr-1" />MACD signal</span>
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}
