// src/workers/forecastWorker.js
import * as ss from "simple-statistics";

/**
 * Message in:
 * {
 *   requestId: string,
 *   dates: string[],        // "YYYY-MM-DD"
 *   values: number[],       // daily costs
 *   horizon: number,        // how many days to forecast
 *   confidence: 0.95 | 0.99 // CI level
 *   anomalyZ: number        // e.g. 3.0
 * }
 *
 * Message out:
 * {
 *   requestId,
 *   fitted: number[],       // same length as values
 *   forecast: number[],     // length = horizon
 *   ciLower: number[],      // length = horizon
 *   ciUpper: number[],      // length = horizon
 *   sigma: number,
 *   anomalies: Array<{ index:number, date:string, actual:number, expected:number, z:number }>
 *   forecastDates: string[] // length = horizon
 * }
 */

function formatDateYYYYMMDD(dateObj) {
  // Keep it stable (UTC-ish) for chart labels.
  return dateObj.toISOString().slice(0, 10);
}

function addDays(dateStrYYYYMMDD, daysToAdd) {
  // "YYYY-MM-DD" parses as midnight UTC in modern JS engines.
  const d = new Date(dateStrYYYYMMDD);
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d;
}

self.onmessage = (event) => {
  const {
    requestId,
    dates = [],
    values = [],
    horizon = 14,
    confidence = 0.95,
    anomalyZ = 3.0,
  } = event.data || {};

  try {
    if (!requestId) throw new Error("Missing requestId");
    if (!Array.isArray(values) || values.length < 3) throw new Error("Not enough data points");
    if (!Array.isArray(dates) || dates.length !== values.length) throw new Error("dates/values mismatch");

    const sanitizedHorizon = Math.max(1, Math.min(365, Number(horizon) || 14));
    const zValue = confidence === 0.99 ? 2.576 : 1.96; // normal approximation

    // --- Linear regression baseline ---
    // Use x = 0..n-1 (stable + avoids timestamp scaling issues).
    const regressionPoints = values.map((y, i) => [i, Number(y) || 0]);
    const lr = ss.linearRegression(regressionPoints);
    const predictLine = ss.linearRegressionLine(lr);

    const fitted = values.map((_, i) => predictLine(i));

    // Residuals -> sigma
    const residuals = values.map((y, i) => (Number(y) || 0) - fitted[i]);
    const sigma = Math.max(1e-9, ss.sampleStandardDeviation(residuals));

    // Anomalies on history (z-score)
    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
      const z = residuals[i] / sigma;
      if (Math.abs(z) >= anomalyZ) {
        anomalies.push({
          index: i,
          date: dates[i],
          actual: Number(values[i]) || 0,
          expected: fitted[i],
          z,
        });
      }
    }

    // Forecast future points
    const startIndex = values.length;
    const forecast = Array.from({ length: sanitizedHorizon }, (_, k) => predictLine(startIndex + k));

    // CI bands (same sigma everywhere for this simple baseline)
    const ciLower = forecast.map((y) => y - zValue * sigma);
    const ciUpper = forecast.map((y) => y + zValue * sigma);

    // Forecast date labels
    const lastDate = dates[dates.length - 1];
    const forecastDates = Array.from({ length: sanitizedHorizon }, (_, k) =>
      formatDateYYYYMMDD(addDays(lastDate, k + 1))
    );

    self.postMessage({
      requestId,
      fitted,
      forecast,
      ciLower,
      ciUpper,
      sigma,
      anomalies,
      forecastDates,
    });
  } catch (err) {
    self.postMessage({
      requestId,
      error: err?.message || String(err),
    });
  }
};
