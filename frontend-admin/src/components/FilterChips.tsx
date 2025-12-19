import { X } from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export type FilterChip = { key: string; label: string; value: string; onRemove: () => void };

export function FilterChips(props: { items: FilterChip[]; className?: string }) {
  if (!props.items.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", props.className)}>
      {props.items.map((it) => (
        <Badge key={it.key} variant="secondary" className="gap-1">
          <span className="max-w-[320px] truncate" title={`${it.label}: ${it.value}`}>
            {it.label}: {it.value}
          </span>
          <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={it.onRemove} aria-label="移除筛选">
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  );
}

