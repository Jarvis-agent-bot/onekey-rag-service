import { type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "success";
}

export function ActionCard({ icon: Icon, title, description, onClick, disabled, variant = "default" }: ActionCardProps) {
  const variantStyles = {
    default: "border-border/70 hover:border-primary/50 hover:bg-primary/5",
    primary: "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10",
    success: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10",
  };

  const iconStyles = {
    default: "text-muted-foreground group-hover:text-primary",
    primary: "text-primary",
    success: "text-emerald-500",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all",
        variantStyles[variant],
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <div className={cn("mt-0.5 rounded-lg bg-background/80 p-2", iconStyles[variant])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}
