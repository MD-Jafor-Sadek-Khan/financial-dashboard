// src/workers/forecastIntelligenceWorker.js
import * as ss from "simple-statistics";

/**
 * Advanced forecasting worker (separate from your existing forecastWorker.js)
 *
 * Inputs:
 * {
 *   requestId: string,
 *   dates: string[],           // "YYYY-MM-DD" (sorted or unsorted)
 *   values: number[],          // metric values per day
 *   horizon: number,           // forecast days
 *   confidence: number,        // e.g. 0.95
 *   anomalyZ: number,          // e.g. 3.0
 *   seasonality: "weekly" | "none",
 *   model: "auto" | "seasonal_naive" | "drift" | "ses" | "holt" | "arima" | "ensemble",
 *   transform: "auto" | "none" | "log1p",
 *   interval: "auto" | "normal" | "empirical"
 * }
 *
 * Outputs:
 * {
 *   requestId,
 *   historyDates: string[],
 *   historyValues: number[],
 *   selectedModel: { id, label, params },
 *   forecastDates: string[],
 *   forecast: number[],
 *   ciLower: number[],
 *   ciUpper: number[],
 *   sigma: number,
 *   interval: { method: string, sigma: number, robustSigma: number, quantiles: { low, high }, z: number },
 *   transform: { setting: string, method: string },
 *   backtest: { window: number, dates: string[], actual: number[], predicted: number[], metrics: {...} },
 *   anomalies: Array<{ index:number, date:string, actual:number, expected:number, z:number }>,
 *   notes: string[],
 *   analysis: {...},
 *   modelLeaderboard: Array<{ id, label, metrics, weight }>
 * }
 */

function formatYYYYMMDD(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function addDaysUTC(dateStrYYYYMMDD, daysToAdd) {
  const d = new Date(dateStrYYYYMMDD);
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d;
}

function clampNonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

function safeFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sortPairsByDate(dates, values) {
  const pairs = dates.map((d, i) => ({ d, v: safeFiniteNumber(values[i]) }));
  pairs.sort((a, b) => new Date(a.d) - new Date(b.d));
  return {
    dates: pairs.map((p) => p.d),
    values: pairs.map((p) => p.v),
  };
}

/**
 * Build a continuous daily series between min and max dates.
 * Missing days are filled with 0 (appropriate for "no usage -> no cost" style metrics).
 */
function buildContinuousDailySeries(inputDates, inputValues) {
  const { dates, values } = sortPairsByDate(inputDates, inputValues);

  const dateToValueMap = new Map();
  for (let i = 0; i < dates.length; i++) {
    dateToValueMap.set(dates[i], safeFiniteNumber(values[i]));
  }

  const start = dates[0];
  const end = dates[dates.length - 1];

  const continuousDates = [];
  const continuousValues = [];
  let missingCount = 0;

  let cursor = new Date(start);
  const endDate = new Date(end);

  // Move day by day (UTC-safe if input is YYYY-MM-DD)
  while (cursor <= endDate) {
    const key = formatYYYYMMDD(cursor);
    const hasValue = dateToValueMap.has(key);
    continuousDates.push(key);
    if (!hasValue) missingCount += 1;
    continuousValues.push(safeFiniteNumber(hasValue ? dateToValueMap.get(key) : 0));
    cursor = addDaysUTC(key, 1);
  }

  return { continuousDates, continuousValues, missingCount };
}

function dayOfWeekIndexUTC(dateStrYYYYMMDD) {
  const d = new Date(dateStrYYYYMMDD);
  return d.getUTCDay(); // 0..6
}

/**
 * Weekly seasonal adjustment: estimate average effect per day-of-week, remove it for modeling,
 * add it back for final forecasts.
 */
function computeWeeklySeasonality(dates, values) {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);

  for (let i = 0; i < dates.length; i++) {
    const dow = dayOfWeekIndexUTC(dates[i]);
    sums[dow] += safeFiniteNumber(values[i]);
    counts[dow] += 1;
  }

  const overallMean = ss.mean(values.map(safeFiniteNumber));
  const seasonalEffect = new Array(7).fill(0);

  for (let d = 0; d < 7; d++) {
    const avg = counts[d] > 0 ? sums[d] / counts[d] : overallMean;
    seasonalEffect[d] = avg - overallMean;
  }

  return { seasonalEffect, overallMean };
}

function applyWeeklyDeseasonalize(dates, values, seasonalEffect) {
  const deseasonalized = values.map((v, i) => {
    const dow = dayOfWeekIndexUTC(dates[i]);
    return safeFiniteNumber(v) - seasonalEffect[dow];
  });
  return deseasonalized;
}

function addWeeklyReseasonalize(dates, values, seasonalEffect) {
  const reseasonalized = values.map((v, i) => {
    const dow = dayOfWeekIndexUTC(dates[i]);
    return safeFiniteNumber(v) + seasonalEffect[dow];
  });
  return reseasonalized;
}

/** Metrics that behave better than MAPE when there are zeros. */
function computeErrorMetrics(actual, predicted, baselineMAE = null) {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) {
    return { mae: null, rmse: null, smape: null, bias: null, mase: null };
  }

  let absSum = 0;
  let sqSum = 0;
  let smapeSum = 0;
  let errSum = 0;

  for (let i = 0; i < n; i++) {
    const a = safeFiniteNumber(actual[i]);
    const p = safeFiniteNumber(predicted[i]);
    const err = a - p;

    absSum += Math.abs(err);
    sqSum += err * err;
    errSum += err;

    const denom = Math.abs(a) + Math.abs(p);
    smapeSum += denom === 0 ? 0 : (2 * Math.abs(err)) / denom;
  }

  const mae = absSum / n;
  const rmse = Math.sqrt(sqSum / n);
  const smape = (smapeSum / n) * 100;

  return {
    mae,
    rmse,
    smape,
    bias: errSum / n,
    mase: baselineMAE && baselineMAE > 0 ? mae / baselineMAE : null,
  };
}

function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.map(safeFiniteNumber).slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function computeSkewness(values) {
  const n = values.length;
  if (n < 3) return null;
  const mean = ss.mean(values);
  const std = ss.sampleStandardDeviation(values) || 0;
  if (std === 0) return 0;

  let m3 = 0;
  for (let i = 0; i < n; i++) {
    m3 += Math.pow(values[i] - mean, 3);
  }
  m3 /= n;
  return m3 / Math.pow(std, 3);
}

function computeKurtosis(values) {
  const n = values.length;
  if (n < 4) return null;
  const mean = ss.mean(values);
  const std = ss.sampleStandardDeviation(values) || 0;
  if (std === 0) return 0;

  let m4 = 0;
  for (let i = 0; i < n; i++) {
    m4 += Math.pow(values[i] - mean, 4);
  }
  m4 /= n;
  return m4 / Math.pow(std, 4) - 3;
}

function computeSummaryStats(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const v = values.map(safeFiniteNumber);
  const mean = ss.mean(v);
  const median = ss.median(v);
  const min = ss.min(v);
  const max = ss.max(v);
  const variance = ss.variance(v) ?? 0;
  const std = ss.sampleStandardDeviation(v) || 0;
  const cv = mean !== 0 ? std / Math.abs(mean) : null;
  const p10 = quantile(v, 0.1);
  const p90 = quantile(v, 0.9);
  const iqr = (quantile(v, 0.75) ?? 0) - (quantile(v, 0.25) ?? 0);
  const zeroCount = v.filter((x) => x === 0).length;
  const zeroRatio = v.length ? zeroCount / v.length : null;
  const skewness = computeSkewness(v);
  const kurtosis = computeKurtosis(v);

  return {
    n: v.length,
    mean,
    median,
    min,
    max,
    variance,
    std,
    cv,
    p10,
    p90,
    iqr,
    zeroRatio,
    skewness,
    kurtosis,
  };
}

function computeAutocorrelation(values, maxLag) {
  const n = values.length;
  if (n === 0) return [];
  const mean = ss.mean(values);
  const denom = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
  if (denom === 0) return new Array(maxLag).fill(0);

  const acf = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    let num = 0;
    for (let i = lag; i < n; i++) {
      num += (values[i] - mean) * (values[i - lag] - mean);
    }
    acf.push(num / denom);
  }
  return acf;
}

function computeRollingStd(values, window) {
  if (values.length < window) return [];
  const rolling = [];
  for (let i = window - 1; i < values.length; i++) {
    const slice = values.slice(i - window + 1, i + 1);
    rolling.push(ss.sampleStandardDeviation(slice) || 0);
  }
  return rolling;
}

function computeTrendStats(values) {
  const n = values.length;
  if (n < 3) {
    const fallback = safeFiniteNumber(values[values.length - 1] ?? 0);
    return {
      slope: 0,
      intercept: fallback,
      r2: null,
      tStat: null,
      line: () => fallback,
    };
  }

  const points = values.map((v, i) => [i, safeFiniteNumber(v)]);
  const lr = ss.linearRegression(points);
  const line = ss.linearRegressionLine(lr);
  const r2 = ss.rSquared(points, line);

  const xBar = (n - 1) / 2;
  let sxx = 0;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
    const yHat = line(x);
    sxx += Math.pow(x - xBar, 2);
    sse += Math.pow(y - yHat, 2);
  }

  const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : null;
  const tStat = se ? lr.m / se : null;

  return {
    slope: lr.m,
    intercept: lr.b,
    r2,
    tStat,
    line,
  };
}

function computeSeasonalityStrength(dates, values, trendLine, seasonalEffect) {
  if (!dates.length || !values.length || seasonalEffect.length !== 7) {
    return { strength: 0, amplitude: 0 };
  }

  const detrended = values.map((v, i) => safeFiniteNumber(v) - trendLine(i));
  const varianceDetrended = ss.variance(detrended) || 0;

  if (varianceDetrended === 0) {
    return { strength: 0, amplitude: 0 };
  }

  const residuals = detrended.map((v, i) => {
    const dow = dayOfWeekIndexUTC(dates[i]);
    return v - seasonalEffect[dow];
  });

  const residualVar = ss.variance(residuals) || 0;
  const strength = Math.max(0, 1 - residualVar / varianceDetrended);
  const amplitude = Math.max(...seasonalEffect) - Math.min(...seasonalEffect);

  return { strength, amplitude };
}

function computeNaiveScale(values, seasonLength) {
  if (values.length <= seasonLength) return null;
  let sum = 0;
  let count = 0;
  for (let i = seasonLength; i < values.length; i++) {
    sum += Math.abs(values[i] - values[i - seasonLength]);
    count += 1;
  }
  return count ? sum / count : null;
}

function computeRecentChange(values, window = 7) {
  if (values.length < window * 2) return null;
  const last = ss.mean(values.slice(-window));
  const prev = ss.mean(values.slice(-window * 2, -window));
  const pctChange = prev !== 0 ? (last - prev) / Math.abs(prev) : null;
  return { last, prev, pctChange, delta: last - prev };
}

function detectChangePoints(dates, values, window = 7, zThreshold = 2.5, maxPoints = 5) {
  const n = values.length;
  if (n < window * 2 + 1) return [];
  const candidates = [];

  for (let i = window; i <= n - window; i++) {
    const before = values.slice(i - window, i);
    const after = values.slice(i, i + window);
    const meanBefore = ss.mean(before);
    const meanAfter = ss.mean(after);
    const pooled = before.concat(after);
    const std = ss.sampleStandardDeviation(pooled) || 0;
    const delta = meanAfter - meanBefore;
    const z = std > 0 ? delta / std : 0;

    if (Math.abs(z) >= zThreshold) {
      candidates.push({
        index: i,
        date: dates[i],
        delta,
        z,
        beforeMean: meanBefore,
        afterMean: meanAfter,
      });
    }
  }

  candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const selected = [];
  for (const cand of candidates) {
    if (selected.every((s) => Math.abs(s.index - cand.index) > window)) {
      selected.push(cand);
    }
    if (selected.length >= maxPoints) break;
  }

  selected.sort((a, b) => a.index - b.index);
  return selected;
}

function applyTransform(values, method) {
  if (method === "log1p") {
    return values.map((v) => Math.log1p(Math.max(0, safeFiniteNumber(v))));
  }
  return values.map(safeFiniteNumber);
}

function invertTransform(values, method) {
  if (method === "log1p") {
    return values.map((v) => Math.expm1(safeFiniteNumber(v)));
  }
  return values.map(safeFiniteNumber);
}

function resolveTransformMethod(setting, summary) {
  if (setting === "log1p") return "log1p";
  if (setting === "none") return "none";
  if (!summary) return "none";

  if (summary.min < 0) return "none";
  if (summary.skewness != null && summary.skewness > 1.25) return "log1p";
  if (summary.cv != null && summary.cv > 1.5) return "log1p";

  return "none";
}

function computeDurbinWatson(residuals) {
  const n = residuals.length;
  if (n < 2) return null;
  let num = 0;
  let denom = 0;
  for (let i = 1; i < n; i++) {
    const diff = residuals[i] - residuals[i - 1];
    num += diff * diff;
  }
  for (let i = 0; i < n; i++) {
    denom += residuals[i] * residuals[i];
  }
  return denom === 0 ? null : num / denom;
}

function computeJarqueBera(residuals) {
  const n = residuals.length;
  if (n < 5) return null;
  const skew = computeSkewness(residuals) ?? 0;
  const kurt = computeKurtosis(residuals) ?? 0;
  return (n / 6) * (Math.pow(skew, 2) + (Math.pow(kurt, 2) / 4));
}

function computeLjungBox(residuals, maxLag = 10) {
  const n = residuals.length;
  if (n < 3) return { q: null, lags: 0 };
  const lagCount = Math.min(maxLag, n - 1);
  const acf = computeAutocorrelation(residuals, lagCount);
  let q = 0;
  for (let k = 1; k <= lagCount; k++) {
    const rho = acf[k - 1] ?? 0;
    q += (rho * rho) / (n - k);
  }
  q *= n * (n + 2);
  return { q, lags: lagCount };
}

function seasonalNaiveForecast(historyValues, horizon, seasonLength = 7) {
  const y = historyValues.map(safeFiniteNumber);
  const n = y.length;

  const forecast = new Array(horizon).fill(0).map((_, k) => {
    if (n >= seasonLength) {
      const idx = n - seasonLength + (k % seasonLength);
      return y[idx];
    }
    return y[n - 1] ?? 0;
  });

  return forecast.map(clampNonNegative);
}

function driftForecast(historyValues, horizon) {
  const y = historyValues.map(safeFiniteNumber);
  const n = y.length;

  const first = y[0] ?? 0;
  const last = y[n - 1] ?? 0;

  const slope = n >= 2 ? (last - first) / (n - 1) : 0;

  const forecast = new Array(horizon).fill(0).map((_, k) => last + slope * (k + 1));
  return forecast.map(clampNonNegative);
}

function sesForecast(historyValues, horizon, alpha = 0.2) {
  const y = historyValues.map(safeFiniteNumber);
  if (y.length === 0) return new Array(horizon).fill(0);

  let level = y[0];
  for (let i = 1; i < y.length; i++) {
    level = alpha * y[i] + (1 - alpha) * level;
  }

  return new Array(horizon).fill(level).map(clampNonNegative);
}

function holtForecast(historyValues, horizon, alpha = 0.3, beta = 0.1) {
  const y = historyValues.map(safeFiniteNumber);
  if (y.length === 0) return new Array(horizon).fill(0);

  let level = y[0];
  let trend = y.length > 1 ? y[1] - y[0] : 0;

  for (let i = 1; i < y.length; i++) {
    const value = y[i];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  return new Array(horizon).fill(0).map((_, k) => clampNonNegative(level + (k + 1) * trend));
}

/**
 * Try ARIMA with a small grid and pick best by validation RMSE.
 * Uses dynamic import to avoid hard failing builds if arima is problematic.
 */
async function arimaAutoForecast(trainSeries, validationSeries, horizon, maxP = 3, maxD = 2, maxQ = 3) {
  const arimaModule = await import("arima");
  const ARIMAConstructor =
    arimaModule?.default ?? arimaModule?.ARIMA ?? arimaModule;

  if (!ARIMAConstructor) {
    throw new Error("ARIMA import succeeded but constructor was not found");
  }

  const train = trainSeries.map(safeFiniteNumber);
  const valid = validationSeries.map(safeFiniteNumber);
  const k = valid.length;

  let best = null;

  for (let p = 0; p <= maxP; p++) {
    for (let d = 0; d <= maxD; d++) {
      for (let q = 0; q <= maxQ; q++) {
        try {
          const modelInstance = new ARIMAConstructor({ p, d, q, verbose: false }).train(train);
          const predictedValidation = modelInstance.predict(k)?.[0] ?? modelInstance.predict(k);
          const validationPred = Array.isArray(predictedValidation) ? predictedValidation : [];

          if (validationPred.length !== k) continue;

          const clippedValidationPred = validationPred.map(clampNonNegative);
          const metrics = computeErrorMetrics(valid, clippedValidationPred);

          // Prefer lowest RMSE, fallback to MAE
          const score = (metrics.rmse ?? Number.POSITIVE_INFINITY) * 1e6 + (metrics.mae ?? Number.POSITIVE_INFINITY);

          if (!best || score < best.score) {
            best = {
              p, d, q,
              score,
              metrics,
              validationPred: clippedValidationPred,
              modelInstance,
            };
          }
        } catch {
          // ignore unstable combos
        }
      }
    }
  }

  if (!best) {
    throw new Error("ARIMA grid search failed (no viable model found)");
  }

  const predictedFuture = best.modelInstance.predict(horizon)?.[0] ?? best.modelInstance.predict(horizon);
  const futurePred = (Array.isArray(predictedFuture) ? predictedFuture : []).map(clampNonNegative);

  return {
    params: { p: best.p, d: best.d, q: best.q },
    validationPred: best.validationPred,
    futurePred,
    metrics: best.metrics,
  };
}

/**
 * Robust anomaly detection vs weekly seasonal-naive expectation
 * using MAD-based scale (stable for heavy-tailed noise).
 */
function detectAnomalies(dates, values, anomalyZ) {
  const y = values.map(safeFiniteNumber);
  const n = y.length;

  const expected = y.map((_, i) => {
    if (i >= 7) return y[i - 7];
    return ss.mean(y.slice(0, Math.min(n, 7)));
  });

  const residuals = y.map((v, i) => v - expected[i]);
  const mad = ss.medianAbsoluteDeviation(residuals.map(Math.abs));
  const robustSigma = Math.max(1e-9, 1.4826 * mad);

  const anomalies = [];
  for (let i = 0; i < n; i++) {
    const z = residuals[i] / robustSigma;
    if (Math.abs(z) >= anomalyZ) {
      anomalies.push({
        index: i,
        date: dates[i],
        actual: y[i],
        expected: expected[i],
        z,
      });
    }
  }

  return { anomalies, robustSigma };
}

function zValueForConfidence(confidence) {
  // Good enough normal approximation for UI intervals
  if (confidence >= 0.995) return 2.807;
  if (confidence >= 0.99) return 2.576;
  if (confidence >= 0.975) return 2.241;
  if (confidence >= 0.95) return 1.96;
  if (confidence >= 0.9) return 1.645;
  return 1.28; // ~80%
}

self.onmessage = async (event) => {
  const {
    requestId,
    dates = [],
    values = [],
    horizon = 14,
    confidence = 0.95,
    anomalyZ = 3.0,
    seasonality = "weekly",
    model = "auto",
    transform = "auto",
    interval = "auto",
  } = event.data || {};

  try {
    if (!requestId) throw new Error("Missing requestId");
    if (!Array.isArray(dates) || !Array.isArray(values)) throw new Error("Invalid dates/values");
    if (dates.length !== values.length) throw new Error("dates/values mismatch");
    if (dates.length < 8) throw new Error("Not enough history (need at least 8 days)");

    const sanitizedHorizon = Math.max(1, Math.min(365, Number(horizon) || 14));
    const selectedConfidence = Number(confidence) || 0.95;
    const z = zValueForConfidence(selectedConfidence);

    // 1) Continuous daily series
    const notes = [];
    const { continuousDates, continuousValues, missingCount } = buildContinuousDailySeries(dates, values);
    const lastHistoryDate = continuousDates[continuousDates.length - 1];

    const summaryStats = computeSummaryStats(continuousValues);
    const transformMethod = resolveTransformMethod(transform, summaryStats);
    if (transformMethod === "log1p") {
      notes.push("Variance stabilization: log1p");
    } else {
      notes.push("Variance stabilization: none");
    }

    const seasonalityEnabled = seasonality === "weekly";
    const seasonLength = seasonalityEnabled ? 7 : 1;

    if (seasonalityEnabled) {
      notes.push("Weekly seasonality: ON (day-of-week adjustment)");
    } else {
      notes.push("Weekly seasonality: OFF");
    }

    const seasonalEffectOriginal = seasonalityEnabled
      ? computeWeeklySeasonality(continuousDates, continuousValues).seasonalEffect
      : new Array(7).fill(0);

    const transformedValues = applyTransform(continuousValues, transformMethod);
    const seasonalEffectModel = seasonalityEnabled
      ? computeWeeklySeasonality(continuousDates, transformedValues).seasonalEffect
      : new Array(7).fill(0);

    let modelInputValues = transformedValues;
    if (seasonalityEnabled) {
      modelInputValues = applyWeeklyDeseasonalize(continuousDates, transformedValues, seasonalEffectModel);
    }

    // 2) Backtest window selection
    const n = modelInputValues.length;
    const preferredWindow = Math.min(28, Math.max(7, Math.floor(n * 0.2)));
    const backtestWindow = Math.min(preferredWindow, n - 2); // keep at least 2 points in train
    const trainSize = n - backtestWindow;

    const train = modelInputValues.slice(0, trainSize);
    const validation = modelInputValues.slice(trainSize);
    const trainTransformed = transformedValues.slice(0, trainSize);

    const actualVal = continuousValues.slice(trainSize).map(safeFiniteNumber);
    const validationDates = continuousDates.slice(trainSize);
    const baselineMAE = computeNaiveScale(continuousValues, seasonLength);

    // Utility to reseasonalize predictions if needed
    const reseasonalizeFuture = (startDate, forecastValues) => {
      let adjusted = forecastValues.map(safeFiniteNumber);
      if (seasonalityEnabled) {
        const futureDates = Array.from({ length: adjusted.length }, (_, k) =>
          formatYYYYMMDD(addDaysUTC(startDate, k + 1))
        );
        adjusted = addWeeklyReseasonalize(futureDates, adjusted, seasonalEffectModel);
      }
      return invertTransform(adjusted, transformMethod).map(clampNonNegative);
    };

    const reseasonalizeValidation = (datesForValidation, predValues) => {
      let adjusted = predValues.map(safeFiniteNumber);
      if (seasonalityEnabled) {
        adjusted = addWeeklyReseasonalize(datesForValidation, adjusted, seasonalEffectModel);
      }
      return invertTransform(adjusted, transformMethod).map(clampNonNegative);
    };

    // 3) Candidate models
    const candidateResults = [];
    const scoreFromMetrics = (metrics) =>
      (metrics.rmse ?? 1e18) * 1e6 + (metrics.mae ?? 1e18) + (metrics.smape ?? 1e18);
    const addCandidate = (candidate) => {
      candidate.score = scoreFromMetrics(candidate.metrics || {});
      candidateResults.push(candidate);
    };

    // Seasonal naive
    {
      const valPredTransformed = seasonalNaiveForecast(trainTransformed, backtestWindow, seasonLength);
      const valPred = invertTransform(valPredTransformed, transformMethod).map(clampNonNegative);
      const metrics = computeErrorMetrics(actualVal, valPred, baselineMAE);
      const futurePredTransformed = seasonalNaiveForecast(transformedValues, sanitizedHorizon, seasonLength);
      const forecastFuture = invertTransform(futurePredTransformed, transformMethod).map(clampNonNegative);

      addCandidate({
        id: "seasonal_naive",
        label: seasonalityEnabled ? "Seasonal Naive (Weekly)" : "Naive (Last Value)",
        params: { seasonLength },
        validationPred: valPred,
        metrics,
        forecastFuture,
        forecastFutureDeseasonal: futurePredTransformed,
      });
    }

    // Drift
    {
      const valPredDeseasonal = driftForecast(train, backtestWindow);
      const valPred = reseasonalizeValidation(validationDates, valPredDeseasonal);
      const metrics = computeErrorMetrics(actualVal, valPred, baselineMAE);
      const forecastFutureDeseasonal = driftForecast(modelInputValues, sanitizedHorizon);
      const forecastFuture = reseasonalizeFuture(lastHistoryDate, forecastFutureDeseasonal);

      addCandidate({
        id: "drift",
        label: "Drift (Trend)",
        params: {},
        validationPred: valPred,
        metrics,
        forecastFuture,
        forecastFutureDeseasonal,
      });
    }

    // SES
    {
      const alphaGrid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      let best = null;

      for (const alpha of alphaGrid) {
        const valPredDeseasonal = sesForecast(train, backtestWindow, alpha);
        const valPred = reseasonalizeValidation(validationDates, valPredDeseasonal);
        const metrics = computeErrorMetrics(actualVal, valPred, baselineMAE);
        const score = scoreFromMetrics(metrics);

        if (!best || score < best.score) {
          best = { alpha, valPred, metrics, score };
        }
      }

      if (best) {
        const forecastFutureDeseasonal = sesForecast(modelInputValues, sanitizedHorizon, best.alpha);
        const forecastFuture = reseasonalizeFuture(lastHistoryDate, forecastFutureDeseasonal);

        addCandidate({
          id: "ses",
          label: "SES (Level)",
          params: { alpha: Number(best.alpha.toFixed(2)) },
          validationPred: best.valPred,
          metrics: best.metrics,
          forecastFuture,
          forecastFutureDeseasonal,
        });
      }
    }

    // Holt
    {
      const alphaGrid = [0.2, 0.4, 0.6, 0.8];
      const betaGrid = [0.1, 0.2, 0.4, 0.6];
      let best = null;

      for (const alpha of alphaGrid) {
        for (const beta of betaGrid) {
          const valPredDeseasonal = holtForecast(train, backtestWindow, alpha, beta);
          const valPred = reseasonalizeValidation(validationDates, valPredDeseasonal);
          const metrics = computeErrorMetrics(actualVal, valPred, baselineMAE);
          const score = scoreFromMetrics(metrics);

          if (!best || score < best.score) {
            best = { alpha, beta, valPred, metrics, score };
          }
        }
      }

      if (best) {
        const forecastFutureDeseasonal = holtForecast(modelInputValues, sanitizedHorizon, best.alpha, best.beta);
        const forecastFuture = reseasonalizeFuture(lastHistoryDate, forecastFutureDeseasonal);

        addCandidate({
          id: "holt",
          label: "Holt (Trend + Level)",
          params: { alpha: Number(best.alpha.toFixed(2)), beta: Number(best.beta.toFixed(2)) },
          validationPred: best.valPred,
          metrics: best.metrics,
          forecastFuture,
          forecastFutureDeseasonal,
        });
      }
    }

    // ARIMA (optional / best when it works)
    let arimaFailureReason = null;
    if (model === "auto" || model === "arima") {
      try {
        const arimaResult = await arimaAutoForecast(train, validation, sanitizedHorizon, 3, 2, 3);

        const valPred = reseasonalizeValidation(validationDates, arimaResult.validationPred);
        const metrics = computeErrorMetrics(actualVal, valPred, baselineMAE);
        const forecastFuture = reseasonalizeFuture(lastHistoryDate, arimaResult.futurePred);

        addCandidate({
          id: "arima",
          label: "ARIMA (Auto Grid Search)",
          params: arimaResult.params,
          validationPred: valPred,
          metrics,
          forecastFuture,
          forecastFutureDeseasonal: arimaResult.futurePred,
        });
      } catch (err) {
        arimaFailureReason = err?.message || String(err);
      }
    }

    // Ensemble weighting
    const weightable = candidateResults.filter((c) => Number.isFinite(c.metrics?.rmse));
    let weightSum = 0;
    for (const c of weightable) {
      const w = 1 / Math.max(c.metrics.rmse, 1e-9);
      c.weight = w;
      weightSum += w;
    }
    if (weightSum > 0) {
      for (const c of weightable) {
        c.weight = c.weight / weightSum;
      }
    } else {
      for (const c of weightable) {
        c.weight = null;
      }
    }

    const ensembleCandidates = weightable.filter(
      (c) =>
        Array.isArray(c.validationPred) &&
        c.validationPred.length === backtestWindow &&
        Array.isArray(c.forecastFuture) &&
        c.forecastFuture.length === sanitizedHorizon &&
        (c.weight ?? 0) > 0
    );

    if (ensembleCandidates.length >= 2) {
      const ensembleWeightSum = ensembleCandidates.reduce((sum, c) => sum + (c.weight ?? 0), 0);
      const normalizedWeight = (c) => (ensembleWeightSum > 0 ? (c.weight ?? 0) / ensembleWeightSum : 0);
      const ensembleValPred = new Array(backtestWindow).fill(0);
      const ensembleFuture = new Array(sanitizedHorizon).fill(0);

      for (const c of ensembleCandidates) {
        const w = normalizedWeight(c);
        for (let i = 0; i < backtestWindow; i++) {
          ensembleValPred[i] += w * safeFiniteNumber(c.validationPred[i]);
        }
        for (let i = 0; i < sanitizedHorizon; i++) {
          ensembleFuture[i] += w * safeFiniteNumber(c.forecastFuture[i]);
        }
      }

      const metrics = computeErrorMetrics(actualVal, ensembleValPred, baselineMAE);

      addCandidate({
        id: "ensemble",
        label: "Ensemble (Weighted)",
        params: { models: ensembleCandidates.length },
        validationPred: ensembleValPred,
        metrics,
        forecastFuture: ensembleFuture,
        forecastFutureDeseasonal: null,
      });
    }

    // Pick best
    let chosen = null;
    if (model !== "auto") {
      chosen = candidateResults.find((c) => c.id === model) ?? null;
    }
    if (!chosen) {
      chosen = candidateResults.reduce((best, cur) => (!best || cur.score < best.score ? cur : best), null);
    }

    if (!chosen) throw new Error("No forecasting candidates available");

    if (arimaFailureReason) {
      notes.push(`ARIMA note: ${arimaFailureReason}`);
    }

    const futureForecast = Array.isArray(chosen.forecastFuture)
      ? chosen.forecastFuture
      : reseasonalizeFuture(lastHistoryDate, chosen.forecastFutureDeseasonal || []);

    // 4) Interval estimation from backtest residuals
    const actualBacktest = actualVal;
    const predBacktest = chosen.validationPred.map(safeFiniteNumber);
    const backtestResiduals = actualBacktest.map((a, i) => a - (predBacktest[i] ?? 0));
    const sigma = Math.max(1e-9, ss.sampleStandardDeviation(backtestResiduals));
    const robustSigma = Math.max(1e-9, 1.4826 * (ss.medianAbsoluteDeviation(backtestResiduals) || 0));
    const residualSkew = computeSkewness(backtestResiduals);
    const residualKurtosis = computeKurtosis(backtestResiduals);
    const jbStat = computeJarqueBera(backtestResiduals);
    const alpha = 1 - selectedConfidence;
    const qLow = quantile(backtestResiduals, alpha / 2);
    const qHigh = quantile(backtestResiduals, 1 - alpha / 2);

    let intervalMethod = interval;
    if (intervalMethod === "auto") {
      if (jbStat != null && jbStat > 5.99) {
        intervalMethod = "empirical";
      } else if (residualSkew != null && Math.abs(residualSkew) > 1) {
        intervalMethod = "empirical";
      } else if (residualKurtosis != null && Math.abs(residualKurtosis) > 1) {
        intervalMethod = "empirical";
      } else {
        intervalMethod = "normal";
      }
    }
    if (intervalMethod === "empirical" && (qLow == null || qHigh == null)) {
      intervalMethod = "normal";
    }

    const sigmaForInterval = Math.max(sigma, robustSigma);
    let lowerOffset = -z * sigmaForInterval;
    let upperOffset = z * sigmaForInterval;

    if (intervalMethod === "empirical") {
      lowerOffset = qLow ?? lowerOffset;
      upperOffset = qHigh ?? upperOffset;
    }

    const ciLower = futureForecast.map((y) => clampNonNegative(y + lowerOffset));
    const ciUpper = futureForecast.map((y) => clampNonNegative(y + upperOffset));

    const coverageCount = actualBacktest.reduce((sum, actual, i) => {
      const lower = (predBacktest[i] ?? 0) + lowerOffset;
      const upper = (predBacktest[i] ?? 0) + upperOffset;
      return sum + (actual >= lower && actual <= upper ? 1 : 0);
    }, 0);
    const intervalCoverage = actualBacktest.length ? coverageCount / actualBacktest.length : null;

    notes.push(`Interval method: ${intervalMethod}`);

    const forecastDates = Array.from({ length: sanitizedHorizon }, (_, k) =>
      formatYYYYMMDD(addDaysUTC(lastHistoryDate, k + 1))
    );

    // 5) Anomalies (robust, weekly-expectation based)
    const { anomalies } = detectAnomalies(continuousDates, continuousValues, Number(anomalyZ) || 3.0);

    const trendStats = computeTrendStats(continuousValues);
    const recentChange = computeRecentChange(continuousValues, 7);
    const seasonalityStrength = seasonalityEnabled
      ? computeSeasonalityStrength(continuousDates, continuousValues, trendStats.line, seasonalEffectOriginal)
      : { strength: 0, amplitude: 0 };

    const rollingStd7 = computeRollingStd(continuousValues, 7);
    const rollingStd7Mean = rollingStd7.length ? ss.mean(rollingStd7) : null;
    const rollingStd7Last = rollingStd7.length ? rollingStd7[rollingStd7.length - 1] : null;
    const overallStd = summaryStats?.std ?? (ss.sampleStandardDeviation(continuousValues) || 0);
    const volRatio = rollingStd7Last != null && overallStd ? rollingStd7Last / overallStd : null;

    const acf = computeAutocorrelation(
      continuousValues,
      Math.min(14, Math.max(1, continuousValues.length - 1))
    );

    const changePoints = detectChangePoints(continuousDates, continuousValues, 7, 2.5, 5);
    const ljungBox = computeLjungBox(backtestResiduals, Math.min(10, backtestResiduals.length - 1));
    const residualDiagnostics = {
      bias: chosen.metrics?.bias ?? null,
      rmse: chosen.metrics?.rmse ?? null,
      mae: chosen.metrics?.mae ?? null,
      smape: chosen.metrics?.smape ?? null,
      mase: chosen.metrics?.mase ?? null,
      durbinWatson: computeDurbinWatson(backtestResiduals),
      jarqueBera: jbStat,
      ljungBoxQ: ljungBox.q,
      ljungBoxLags: ljungBox.lags,
      intervalCoverage,
    };

    const analysis = {
      summary: {
        ...(summaryStats || {}),
        missingDays: missingCount,
        startDate: continuousDates[0],
        endDate: continuousDates[continuousDates.length - 1],
      },
      trend: {
        slopePerDay: trendStats.slope,
        r2: trendStats.r2,
        tStat: trendStats.tStat,
        direction:
          trendStats.slope > 0.0001 ? "up" : trendStats.slope < -0.0001 ? "down" : "flat",
        last7Mean: recentChange?.last ?? null,
        prev7Mean: recentChange?.prev ?? null,
        pctChange7: recentChange?.pctChange ?? null,
      },
      seasonality: {
        enabled: seasonalityEnabled,
        strength: seasonalityStrength.strength,
        amplitude: seasonalityStrength.amplitude,
        weeklyProfile: seasonalEffectOriginal,
      },
      volatility: {
        rollingStd7Mean,
        rollingStd7Last,
        volRatio,
        robustSigma: Math.max(1e-9, 1.4826 * (ss.medianAbsoluteDeviation(continuousValues) || 0)),
      },
      autocorrelation: {
        maxLag: acf.length,
        acf,
        acfAt7: acf[6] ?? null,
      },
      changePoints,
      residualDiagnostics,
    };

    const modelLeaderboard = candidateResults
      .map((c) => ({
        id: c.id,
        label: c.label,
        params: c.params,
        metrics: c.metrics,
        score: c.score,
        weight: c.weight ?? null,
      }))
      .sort((a, b) => (a.score ?? 1e18) - (b.score ?? 1e18));

    self.postMessage({
      requestId,
      historyDates: continuousDates,
      historyValues: continuousValues.map(clampNonNegative),
      selectedModel: { id: chosen.id, label: chosen.label, params: chosen.params },
      forecastDates,
      forecast: futureForecast,
      ciLower,
      ciUpper,
      sigma: sigmaForInterval,
      interval: {
        method: intervalMethod,
        sigma: sigmaForInterval,
        robustSigma,
        quantiles: { low: qLow, high: qHigh },
        z,
      },
      transform: {
        setting: transform,
        method: transformMethod,
      },
      backtest: {
        window: backtestWindow,
        dates: validationDates,
        actual: actualBacktest.map(clampNonNegative),
        predicted: predBacktest.map(clampNonNegative),
        metrics: chosen.metrics,
      },
      anomalies,
      notes,
      analysis,
      modelLeaderboard,
    });
  } catch (err) {
    self.postMessage({
      requestId,
      error: err?.message || String(err),
    });
  }
};
