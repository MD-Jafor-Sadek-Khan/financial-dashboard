// src/utils/forecastCacheV2.js
import { get, set } from "idb-keyval";

/**
 * Separate cache namespace from your existing forecastCache.js
 * so nothing collides.
 */
export function createForecastV2CacheKey({
  dates,
  values,
  horizon,
  confidence,
  anomalyZ,
  seasonality,
  model,
  transform,
  interval,
}) {
  const head = dates?.[0] || "";
  const tail = dates?.[dates.length - 1] || "";
  const n = values?.length || 0;

  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(n / 25));
  for (let i = 0; i < n; i += stride) {
    const v = Math.round((Number(values[i]) || 0) * 100);
    hash ^= v;
    hash = Math.imul(hash, 16777619);
  }

  return [
    "forecast:v2",
    head,
    tail,
    `n=${n}`,
    `h=${horizon}`,
    `c=${confidence}`,
    `z=${anomalyZ}`,
    `s=${seasonality}`,
    `m=${model}`,
    `t=${transform}`,
    `i=${interval}`,
    `hash=${hash >>> 0}`,
  ].join("|");
}

export async function getCachedForecastV2(cacheKey) {
  return get(cacheKey);
}

export async function setCachedForecastV2(cacheKey, payload) {
  return set(cacheKey, payload);
}
