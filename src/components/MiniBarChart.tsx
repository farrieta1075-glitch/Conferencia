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

export function MiniBarChart({
  series,
  points,
  height = 88,
  selectedId,
  onSelect,
}: {
  series: BarSeries[];
  points: BarPoint[];
  height?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)),
  );
  const barW = Math.max(6, 140 / Math.max(points.length, 1));
  const groupW = barW * series.length + 8;
  const width = Math.max(160, points.length * groupW + 8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {points.map((point, index) => {
        const groupX = 8 + index * groupW;
        const id = point.id ?? point.label;
        const selected = selectedId === id;
        return (
          <g
            key={id}
            className={onSelect ? "cursor-pointer" : undefined}
            onClick={(event) => {
              if (!onSelect) return;
              event.stopPropagation();
              onSelect(id);
            }}
          >
            {onSelect ? (
              <rect
                x={groupX - 2}
                y={0}
                width={barW * series.length + 4}
                height={height}
                fill={selected ? "#E8C39A" : "transparent"}
                opacity={selected ? 0.25 : 0}
              />
            ) : null}
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
              fontWeight={selected ? 700 : 400}
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
