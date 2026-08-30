import { useCallback, useEffect, useState } from "react";

export function useToast(ms = 3200) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(t);
  }, [message, ms]);
  const show = useCallback((m: string) => setMessage(m), []);
  return { message, show };
}
