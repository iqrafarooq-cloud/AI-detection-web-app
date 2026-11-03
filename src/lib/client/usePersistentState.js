"use client";

import { useEffect, useRef, useState } from "react";
import { loadSession, saveSession } from "@/lib/client/files";

// Module-level cache: survives client-side navigation between pages (the JS
// module stays loaded), so returning to a tool shows the work exactly as it was.
const memory = new Map();

/**
 * useState that survives navigating away and back.
 *
 * - Always kept in memory for the lifetime of the tab's JS.
 * - With `storage: true` (default) also mirrored to sessionStorage, so it
 *   survives a page reload too. Use `storage: false` for values that are not
 *   JSON-serializable (e.g. File objects).
 *
 * The first render uses the in-memory value or `initial` (never storage), so
 * server and client markup match; stored values are restored right after mount.
 */
export function usePersistentState(key, initial, { storage = true } = {}) {
  const fullKey = `textwise:state:${key}`;
  const [value, setValue] = useState(() => (memory.has(fullKey) ? memory.get(fullKey) : initial));
  const hydrated = useRef(memory.has(fullKey));

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      const stored = storage ? loadSession(fullKey) : null;
      if (stored && "v" in stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(stored.v);
        return;
      }
    }
    memory.set(fullKey, value);
    if (storage) saveSession(fullKey, { v: value });
  }, [fullKey, value, storage]);

  return [value, setValue];
}
