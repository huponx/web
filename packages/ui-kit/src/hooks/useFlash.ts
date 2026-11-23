import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * A message passed by the page that sent us here (`navigate(path, { state })`).
 * It is kept for this page and then dropped from the history entry, so a refresh does not show it again.
 */
export function useFlash<T extends object>(): T | null {
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = location.state as T | null;
  const [flash, setFlash] = useState<T | null>(incoming);
  useEffect(() => {
    if (!incoming) return;
    setFlash(incoming);
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, [incoming, location.pathname, location.search, location.hash, navigate]);
  return flash;
}
