"use client";

import * as React from "react";

/** Simple controlled tab strip. */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: string | number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            active === t.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
          {t.badge !== undefined && t.badge !== "" && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
