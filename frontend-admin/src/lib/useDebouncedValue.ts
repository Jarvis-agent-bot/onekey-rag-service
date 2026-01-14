import { useEffect, useState } from "react";

/**
 * 防抖 Hook - 延迟更新值直到停止输入
 * @param value 原始值
 * @param delay 延迟毫秒数，默认 300ms
 * @returns 防抖后的值
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
