"use client";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarPoint {
  id?: string;
  label: string;
  values: Record<string, number>;
}

export type BarFormat = "k" | "count" | "money";

function formatBarValue(value: number, format: BarFormat): string {
  if (value < 0.05) return "";
  if (format === "count") return String(Math.round(value));
  if (format === "money") {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return `${(value / 1000).toFixed(1)}K`;
}

export function MiniBarChart({
  series,
  points,
  height = 160,
  stacked = false,
  format = "k",
  selectedId,
  onSelect,
  showSegmentLabels = true,
}: {
  series: BarSeries[];
  points: BarPoint[];
  height?: number;
  stacked?: boolean;
  format?: BarFormat;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showSegmentLabels?: boolean;
}) {
  const totals = points.map((point) => series.reduce((sum, item) => sum + (point.values[item.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const rotateLabels = format === "money";
  const barW = stacked ? (format === "money" ? 42 : 36) : Math.max(8, 140 / Math.max(points.length, 1));
  const groupW = stacked ? (format === "money" ? barW + 40 : barW + 28) : barW * series.length + 8;
  const width = Math.max(180, points.length * groupW + 16);
  const topPad = format === "money" ? 26 : 20;
  const bottomPad = rotateLabels ? 58 : 36;
  const usable = height - topPad - bottomPad;
  const axisY = height - bottomPad;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
      <line x1="4" y1={axisY} x2={width - 4} y2={axisY} stroke="#CBD5E1" strokeWidth="1" />
      {points.map((point, index) => {
        const groupX = 10 + index * groupW;
        const id = point.id ?? point.label;
        const selected = selectedId === id;
        const total = totals[index];
        return (
          <g
            key={`${id}-${index}`}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={(event) => {
              if (!onSelect) return;
              event.stopPropagation();
              onSelect(id);
            }}
          >
            {stacked ? (
              <StackedBar
                x={groupX}
                barW={barW}
                height={height}
                usable={usable}
                topPad={topPad}
                bottomPad={bottomPad}
                max={max}
                series={series}
                values={point.values}
                total={total}
                selected={selected}
                format={format}
                showSegmentLabels={showSegmentLabels}
              />
            ) : (
              series.map((item, sIndex) => {
                const value = point.values[item.key] ?? 0;
                const h = (value / max) * usable;
                return (
                  <rect
                    key={item.key}
                    x={groupX + sIndex * barW}
                    y={height - bottomPad - h}
                    width={barW - 1}
                    height={Math.max(h, 0)}
                    fill={item.color}
                    rx={1}
                  />
                );
              })
            )}
            <text
              x={groupX + barW / 2}
              y={axisY + (rotateLabels ? 12 : 14)}
              textAnchor={rotateLabels ? "end" : "middle"}
              fontSize={8}
              fill="#334155"
              fontWeight={selected ? 700 : 500}
              transform={
                rotateLabels
                  ? `rotate(-42 ${groupX + barW / 2} ${axisY + 12})`
                  : undefined
              }
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StackedBar({
  x,
  barW,
  height,
  usable,
  topPad,
  bottomPad,
  max,
  series,
  values,
  total,
  selected,
  format,
  showSegmentLabels,
}: {
  x: number;
  barW: number;
  height: number;
  usable: number;
  topPad: number;
  bottomPad: number;
  max: number;
  series: BarSeries[];
  values: Record<string, number>;
  total: number;
  selected: boolean;
  format: BarFormat;
  showSegmentLabels: boolean;
}) {
  const bottom = height - bottomPad;
  let y = bottom;
  const totalH = (total / max) * usable;
  const totalLabel = formatBarValue(total, format);
  const totalY = Math.max(topPad - 2, Math.min(bottom - totalH - 6, bottom - 12));

  return (
    <>
      {selected ? (
        <rect
          x={x - 4}
          y={2}
          width={barW + 8}
          height={height - bottomPad + 6}
          fill="#E8C39A"
          opacity="0.2"
          rx={4}
        />
      ) : null}
      {series.map((item) => {
        const value = values[item.key] ?? 0;
        const h = (value / max) * usable;
        y -= h;
        const label = formatBarValue(value, format);
        const fits = showSegmentLabels && h >= 14 && barW >= 28 && format !== "money";
        const midY = y + h / 2 + 3;
        return (
          <g key={item.key}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 0)} fill={item.color} />
            {fits && label ? (
              <text
                x={x + barW / 2}
                y={midY}
                textAnchor="middle"
                fontSize={7}
                fontWeight={600}
                fill="#FFFFFF"
              >
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
      {totalLabel ? (
        <text
          x={x + barW / 2}
          y={totalY}
          textAnchor="middle"
          fontSize={format === "money" ? 8 : 10}
          fontWeight={700}
          fill="#0F172A"
        >
          {totalLabel}
        </text>
      ) : null}
    </>
  );
}
