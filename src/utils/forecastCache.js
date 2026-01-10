// src/utils/forecastCache.js
import { get, set } from "idb-keyval";

/**
 * Small, stable hash for caching.
 * (We’re hashing daily aggregates, not million-row raw data.)
 */
export function createSeriesCacheKey({ dates, values, horizon, confidence, anomalyZ }) {
  const head = dates?.[0] || "";
  const tail = dates?.[dates.length - 1] || "";
  const n = values?.length || 0;

  // Lightweight rolling hash over a few points
  let hash = 2166136261; // FNV-ish
  const stride = Math.max(1, Math.floor(n / 25)); // sample up to ~25 points
  for (let i = 0; i < n; i += stride) {
    const v = Math.round((Number(values[i]) || 0) * 100); // cents-ish
    hash ^= v;
    hash = Math.imul(hash, 16777619);
  }

  return [
    "forecast:v1",
    head,
    tail,
    `n=${n}`,
    `h=${horizon}`,
    `c=${confidence}`,
    `z=${anomalyZ}`,
    `hash=${hash >>> 0}`,
  ].join("|");
}

export async function getCachedForecast(cacheKey) {
  return get(cacheKey);
}

export async function setCachedForecast(cacheKey, payload) {
  // Keep payload small (no giant arrays beyond daily + horizon)
  return set(cacheKey, payload);
}
