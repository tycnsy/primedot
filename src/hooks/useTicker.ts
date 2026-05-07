import { useEffect, useState } from 'react';

/**
 * Re-renders the consumer every `intervalMs` (default 1000) by returning a fresh
 * Date. Used by pace displays so live values tick without manual subscribe code.
 */
export function useTicker(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
