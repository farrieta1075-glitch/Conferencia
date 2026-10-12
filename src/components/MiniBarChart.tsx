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

export type BarFormat = "k" | "count";

function formatBarValue(value: number, format: BarFormat): string {
  if (value < 0.05) return "";
  if (format === "count") return String(Math.round(value));
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
}: {
  series: BarSeries[];
  points: BarPoint[];
  height?: number;
  stacked?: boolean;
  format?: BarFormat;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const totals = points.map((point) => series.reduce((sum, item) => sum + (point.values[item.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const barW = stacked ? 36 : Math.max(8, 140 / Math.max(points.length, 1));
  const groupW = stacked ? barW + 28 : barW * series.length + 8;
  const width = Math.max(180, points.length * groupW + 16);
  const topPad = 18;
  const bottomPad = 16;
  const usable = height - topPad - bottomPad;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
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
                max={max}
                series={series}
                values={point.values}
                total={total}
                selected={selected}
                format={format}
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
              y={height - 3}
              textAnchor="middle"
              fontSize={8}
              fill="#334155"
              fontWeight={selected ? 700 : 500}
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
  max,
  series,
  values,
  total,
  selected,
  format,
}: {
  x: number;
  barW: number;
  height: number;
  usable: number;
  max: number;
  series: BarSeries[];
  values: Record<string, number>;
  total: number;
  selected: boolean;
  format: BarFormat;
}) {
  const bottom = height - 16;
  let y = bottom;
  const totalH = (total / max) * usable;
  const totalLabel = formatBarValue(total, format);

  return (
    <>
      {selected ? (
        <rect x={x - 4} y={2} width={barW + 22} height={height - 4} fill="#E8C39A" opacity="0.2" rx={4} />
      ) : null}
      {series.map((item) => {
        const value = values[item.key] ?? 0;
        const h = (value / max) * usable;
        y -= h;
        const label = formatBarValue(value, format);
        const fits = h >= 12 && barW >= 28;
        const midY = y + h / 2 + 3;
        return (
          <g key={item.key}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 0)} fill={item.color} />
            {label ? (
              <text
                x={fits ? x + barW / 2 : x + barW + 3}
                y={fits ? midY : Math.max(y + 8, midY)}
                textAnchor={fits ? "middle" : "start"}
                fontSize={7}
                fontWeight={600}
                fill={fits ? "#FFFFFF" : item.color}
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
          y={Math.max(11, bottom - totalH - 4)}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="#0F172A"
        >
          {totalLabel}
        </text>
      ) : null}
    </>
  );
}
