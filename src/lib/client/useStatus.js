"use client";

import { useEffect, useState } from "react";
import { getJson } from "./api";

let cached = null;
let inflight = null;

/** Fetches /api/status once per page load: which providers are configured. */
export function useStatus() {
  const [status, setStatus] = useState(cached);
  useEffect(() => {
    if (cached) return;
    inflight ??= getJson("/api/status").then((s) => (cached = s));
    let alive = true;
    inflight
      .then((s) => alive && setStatus(s))
      .catch(() => {
        inflight = null;
      });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
