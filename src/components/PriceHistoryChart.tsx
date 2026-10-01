import React, { useMemo, useState } from 'react';
import { formatPriceTR } from '../shared/priceUtils';
import { CurrencyCode, PriceHistoryRecord } from '../shared/types';

interface PriceHistoryChartProps {
  history: PriceHistoryRecord[];
  targetPrice: number | null;
  currency: CurrencyCode;
}

const TIME_RANGES = [
  { id: '7d', label: '7 gün', days: 7 },
  { id: '30d', label: '30 gün', days: 30 },
  { id: '90d', label: '3 ay', days: 90 },
  { id: '180d', label: '6 ay', days: 180 },
  { id: '365d', label: '1 yıl', days: 365 },
  { id: 'all', label: 'Tüm zamanlar', days: 0 },
] as const;

export const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({
  history,
  targetPrice,
  currency,
}) => {
  const [selectedRange, setSelectedRange] = useState<string>('30d');

  const filteredHistory = useMemo(() => {
    const rangeObj = TIME_RANGES.find((r) => r.id === selectedRange);
    if (!rangeObj || rangeObj.days === 0) return history;
    const cutoff = Date.now() - rangeObj.days * 24 * 3600_000;
    const filtered = history.filter((h) => new Date(h.checked_at).getTime() >= cutoff);
    return filtered.length > 0 ? filtered : history;
  }, [history, selectedRange]);

  const chartGeometry = useMemo(() => {
    if (filteredHistory.length === 0) return null;

    const prices = filteredHistory.map((h) => h.price);
    if (targetPrice && targetPrice > 0) {
      prices.push(targetPrice);
    }

    const minVal = Math.min(...prices) * 0.96;
    const maxVal = Math.max(...prices) * 1.04;
    const span = Math.max(1, maxVal - minVal);

    const width = 760;
    const height = 220;
    const padX = 48;
    const padY = 24;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    const points = filteredHistory.map((item, idx) => {
      const x =
        filteredHistory.length === 1
          ? width / 2
          : padX + (idx / (filteredHistory.length - 1)) * usableW;
      const y = padY + usableH - ((item.price - minVal) / span) * usableH;
      return { x, y, item };
    });

    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
    const areaPoints = `${points[0].x},${height - padY} ${polylinePoints} ${
      points[points.length - 1].x
    },${height - padY}`;

    const targetY =
      targetPrice && targetPrice > 0
        ? padY + usableH - ((targetPrice - minVal) / span) * usableH
        : null;

    return {
      width,
      height,
      padX,
      padY,
      minVal,
      maxVal,
      points,
      polylinePoints,
      areaPoints,
      targetY,
    };
  }, [filteredHistory, targetPrice]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Fiyat Geçmişi Grafiği
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tarih, fiyat ve mağaza bazlı değişim kayıtları
          </p>
        </div>

        {/* Segmented Range Controls (Section 9) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              onClick={() => setSelectedRange(range.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedRange === range.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {!chartGeometry ? (
        <div className="h-48 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
          Henüz bu dönem için kaydedilmiş doğrulanmış fiyat geçmişi bulunmuyor.
        </div>
      ) : (
        <div className="relative bg-slate-50/60 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 rounded-lg p-3">
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className="w-full h-52 overflow-visible"
          >
            <defs>
              <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Reference Lines */}
            {[0, 0.5, 1].map((ratio, i) => {
              const y =
                chartGeometry.padY +
                ratio * (chartGeometry.height - chartGeometry.padY * 2);
              const val =
                chartGeometry.maxVal -
                ratio * (chartGeometry.maxVal - chartGeometry.minVal);
              return (
                <g key={i}>
                  <line
                    x1={chartGeometry.padX}
                    y1={y}
                    x2={chartGeometry.width - chartGeometry.padX}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={chartGeometry.padX - 6}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                  >
                    {Math.round(val).toLocaleString('tr-TR')}
                  </text>
                </g>
              );
            })}

            {/* Target Price Line */}
            {chartGeometry.targetY !== null && targetPrice && (
              <g>
                <line
                  x1={chartGeometry.padX}
                  y1={chartGeometry.targetY}
                  x2={chartGeometry.width - chartGeometry.padX}
                  y2={chartGeometry.targetY}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
                <text
                  x={chartGeometry.width - chartGeometry.padX}
                  y={chartGeometry.targetY - 6}
                  textAnchor="end"
                  className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono font-medium"
                >
                  Hedef: {formatPriceTR(targetPrice, currency, false)}
                </text>
              </g>
            )}

            {/* Area & Line */}
            {chartGeometry.points.length > 1 && (
              <>
                <polygon points={chartGeometry.areaPoints} fill="url(#priceAreaGrad)" />
                <polyline
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={chartGeometry.polylinePoints}
                />
              </>
            )}

            {/* Data Points */}
            {chartGeometry.points.map((pt, idx) => {
              const isDrop =
                pt.item.old_price !== null && pt.item.price < pt.item.old_price;
              const dateLabel = new Date(pt.item.checked_at).toLocaleDateString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
              });
              return (
                <g key={pt.item.id || idx}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isDrop ? 5 : 4}
                    className={
                      isDrop
                        ? 'fill-emerald-500 stroke-white dark:stroke-slate-900 stroke-2'
                        : 'fill-sky-500 stroke-white dark:stroke-slate-900 stroke-2'
                    }
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    className="fill-slate-700 dark:fill-slate-300 text-[10px] font-mono font-medium"
                  >
                    {formatPriceTR(pt.item.price, currency, false)}
                  </text>
                  <text
                    x={pt.x}
                    y={chartGeometry.height - 6}
                    textAnchor="middle"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                  >
                    {dateLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Chronological Price History Log (Section 9 Example: 01.09.2026 — 10.499 TL) */}
      {filteredHistory.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 px-3 font-medium">Tarih</th>
                <th className="py-2 px-3 font-medium">Mağaza</th>
                <th className="py-2 px-3 font-medium text-right">Fiyat</th>
                <th className="py-2 px-3 font-medium text-right">Değişim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono tabular-nums">
              {[...filteredHistory].reverse().map((item) => {
                const dateFormatted = new Date(item.checked_at).toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
                const diff =
                  item.old_price && item.old_price > 0
                    ? item.price - item.old_price
                    : null;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                      {dateFormatted}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-300">
                      {item.store_name || item.store_id}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatPriceTR(item.price, item.currency, false)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {diff === null || diff === 0 ? (
                        <span className="text-slate-400">Başlangıç kaydı</span>
                      ) : diff < 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatPriceTR(diff, item.currency, false)} (Düşüş)
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">
                          +{formatPriceTR(diff, item.currency, false)} (Artış)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
