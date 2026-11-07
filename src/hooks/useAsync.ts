import { useCallback, useEffect, useState } from "react";
import { notifyError } from "@/lib/notify";

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => { if (alive) setData(value); })
      .catch((e: unknown) => {
        if (!alive) return;
        const message = e instanceof Error ? e.message : "请求失败";
        setError(message);
        notifyError(message);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, deps);

  useEffect(run, [run]);

  return { data, setData, loading, error, reload: run };
}
