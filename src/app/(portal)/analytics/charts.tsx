"use client";

import { useId } from "react";

export interface SeriesPoint {
  date: string;
  value: number;
}

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/**
 * Schlanke, abhängigkeitsfreie SVG-Charts (kein npm-Paket nötig). Skalieren per
 * viewBox auf die Containerbreite.
 */
export function LineChart({
  points,
  height = 220,
  color = "#E8920B",
  format = (n: number) => String(Math.round(n)),
}: {
  points: SeriesPoint[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  const gid = useId();
  const w = 760;
  const h = height;
  const padL = 56;
  const padB = 26;
  const padT = 12;
  const padR = 12;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i: number) => padL + i * stepX;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area =
    points.length > 0
      ? `M ${x(0)} ${y(points[0]!.value)} ` +
        points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") +
        ` L ${x(points.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`
      : "";

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      <defs>
        <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={w - padR}
            y1={y(gv)}
            y2={y(gv)}
            stroke="currentColor"
            strokeOpacity="0.1"
          />
          <text x={padL - 8} y={y(gv) + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.5">
            {format(gv)}
          </text>
        </g>
      ))}
      {area && <path d={area} fill={`url(#grad-${gid})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) =>
        i % labelEvery === 0 || i === points.length - 1 ? (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">
            {niceDate(p.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function BarChart({
  points,
  height = 220,
  color = "#3b82f6",
  format = (n: number) => String(Math.round(n)),
}: {
  points: SeriesPoint[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
}) {
  const w = 760;
  const h = height;
  const padL = 56;
  const padB = 26;
  const padT = 12;
  const padR = 12;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.value));
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.max(2, slot * 0.6);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={y(gv)} y2={y(gv)} stroke="currentColor" strokeOpacity="0.1" />
          <text x={padL - 8} y={y(gv) + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.5">
            {format(gv)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = padL + slot * i + slot / 2;
        const barH = padT + innerH - y(p.value);
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={y(p.value)} width={barW} height={Math.max(0, barH)} rx="3" fill={color} opacity="0.85" />
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={cx} y={h - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.5">
                {niceDate(p.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
