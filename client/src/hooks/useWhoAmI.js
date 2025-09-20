import { useEffect, useState, useCallback } from "react";

export default function useWhoAmI() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/whoami", { credentials: "include" });
      if (!res.ok) throw new Error(`whoami ${res.status}`);
      const data = await res.json();
      setUser(data?.user || null);
    } catch (e) {
      setUser(null);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { user, loading, error, refresh };
}
