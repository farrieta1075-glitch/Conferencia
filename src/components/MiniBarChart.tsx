"use client";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarPoint {
  label: string;
  values: Record<string, number>;
}

export function MiniBarChart({
  series,
  points,
  height = 88,
}: {
  series: BarSeries[];
  points: BarPoint[];
  height?: number;
}) {
  const max = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)),
  );
  const barW = Math.max(6, 140 / Math.max(points.length, 1));
  const width = Math.max(160, points.length * (barW * series.length + 8) + 8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {points.map((point, index) => {
        const groupX = 8 + index * (barW * series.length + 8);
        return (
          <g key={point.label}>
            {series.map((item, sIndex) => {
              const value = point.values[item.key] ?? 0;
              const h = (value / max) * (height - 22);
              return (
                <rect
                  key={item.key}
                  x={groupX + sIndex * barW}
                  y={height - 16 - h}
                  width={barW - 1}
                  height={Math.max(h, 0)}
                  fill={item.color}
                  rx={1}
                />
              );
            })}
            <text
              x={groupX + (barW * series.length) / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize={7}
              fill="#334155"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
