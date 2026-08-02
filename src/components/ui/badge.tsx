import * as React from "react";

const toneClasses: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
};

export function Badge({
  children,
  tone = "gray",
  className = "",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClasses;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETE" || status === "COMPLETED" || status === "ANALYZED"
      ? "green"
      : status === "FAILED"
        ? "red"
        : status === "PROCESSING" || status === "RUNNING" || status === "PARSING"
          ? "blue"
          : status === "PENDING" || status === "VALIDATING" || status === "COLLECTING"
            ? "amber"
            : "gray";
  return <Badge tone={tone}>{status}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <Badge tone="gray">—</Badge>;
  const tone = sentiment === "LIKE" ? "green" : sentiment === "DISLIKE" ? "red" : "gray";
  return <Badge tone={tone}>{sentiment}</Badge>;
}
