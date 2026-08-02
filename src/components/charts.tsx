"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import type { BreakdownRow, OverallSummary, LegSummary } from "@/lib/aggregate";
import { SENTIMENT_COLORS } from "@/lib/labels";

/** Overall Like / Dislike / Indifferent split. */
export function SentimentDonut({ overall }: { overall: OverallSummary }) {
  const data = [
    { name: "Like", value: overall.LIKE, key: "LIKE" },
    { name: "Indifferent", value: overall.INDIFFERENT, key: "INDIFFERENT" },
    { name: "Dislike", value: overall.DISLIKE, key: "DISLIKE" },
  ].filter((d) => d.value > 0);

  if (overall.total === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No analyzed responses yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={SENTIMENT_COLORS[d.key]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `${v} responses`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

/**
 * Sentiment distribution within each bucket of one demographic dimension,
 * as 100% stacked horizontal bars so segments are comparable.
 */
export function BreakdownChart({ rows, height }: { rows: BreakdownRow[]; height?: number }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data</p>;
  }

  const data = rows.map((r) => ({
    label: r.label,
    Like: r.likePct,
    Indifferent: r.indifferentPct,
    Dislike: r.dislikePct,
    total: r.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(140, rows.length * 34 + 60)}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number, name: string) => [`${value}%`, name]}
          labelFormatter={(label: string) => {
            const row = data.find((d) => d.label === label);
            return `${label} (n=${row?.total ?? 0})`;
          }}
        />
        <Legend />
        <Bar dataKey="Like" stackId="a" fill={SENTIMENT_COLORS.LIKE} />
        <Bar dataKey="Indifferent" stackId="a" fill={SENTIMENT_COLORS.INDIFFERENT} />
        <Bar dataKey="Dislike" stackId="a" fill={SENTIMENT_COLORS.DISLIKE} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Absolute per-leg comparison, so different legs of a study sit side by side. */
export function LegComparisonChart({ legs }: { legs: LegSummary[] }) {
  if (legs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No legs</p>;
  }
  const data = legs.map((l) => ({
    label: `${l.legName}`,
    Like: l.LIKE,
    Indifferent: l.INDIFFERENT,
    Dislike: l.DISLIKE,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, legs.length * 60 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Like" stackId="a" fill={SENTIMENT_COLORS.LIKE} />
        <Bar dataKey="Indifferent" stackId="a" fill={SENTIMENT_COLORS.INDIFFERENT} />
        <Bar dataKey="Dislike" stackId="a" fill={SENTIMENT_COLORS.DISLIKE} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Compact inline bar used in the studies list. */
export function SentimentSparkBar({
  like,
  dislike,
  indifferent,
}: {
  like: number;
  dislike: number;
  indifferent: number;
}) {
  const total = like + dislike + indifferent;
  if (total === 0) return <span className="text-xs text-muted-foreground">No data</span>;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2.5 w-32 overflow-hidden rounded-full bg-muted" title={`${like} like / ${indifferent} indifferent / ${dislike} dislike`}>
      <div style={{ width: pct(like), backgroundColor: SENTIMENT_COLORS.LIKE }} />
      <div style={{ width: pct(indifferent), backgroundColor: SENTIMENT_COLORS.INDIFFERENT }} />
      <div style={{ width: pct(dislike), backgroundColor: SENTIMENT_COLORS.DISLIKE }} />
    </div>
  );
}
