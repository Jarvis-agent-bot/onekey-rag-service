import { useEffect, useState } from "react";
import { Input } from "./ui/input";

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
}

/**
 * 带防抖的输入框
 * - 显示立即更新
 * - onChange 回调延迟触发
 */
export function DebouncedInput({
  value: externalValue,
  onChange,
  debounceMs = 300,
  ...props
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState(externalValue);

  // 同步外部值变化（如清空筛选）
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  // 防抖更新外部值
  useEffect(() => {
    if (localValue === externalValue) return;
    const timer = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, externalValue]);

  return (
    <Input
      {...props}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
}
