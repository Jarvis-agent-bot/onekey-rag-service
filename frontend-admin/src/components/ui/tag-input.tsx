import { X } from "lucide-react";
import { useState, KeyboardEvent } from "react";
import { cn } from "../../lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TagInput({ value, onChange, placeholder, className, disabled }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        "flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {value.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="rounded-full p-0.5 hover:bg-primary/20"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
