import * as React from "react";

export function Button({
  className = "",
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent",
    ghost: "hover:bg-accent",
  };
  const sizes: Record<string, string> = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 text-xs",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
