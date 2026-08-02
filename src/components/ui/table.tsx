import * as React from "react";

export function Table({ className = "", ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto rounded-lg border">
      <table className={`w-full caption-bottom text-sm ${className}`} {...props} />
    </div>
  );
}
export function THead({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`bg-muted/50 ${className}`} {...props} />;
}
export function TBody({ className = "", ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}
export function TR({ className = "", ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`border-b transition-colors hover:bg-muted/30 ${className}`} {...props} />;
}
export function TH({ className = "", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`h-10 px-3 text-left align-middle font-medium text-muted-foreground ${className}`} {...props} />;
}
export function TD({ className = "", ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`p-3 align-middle ${className}`} {...props} />;
}
