// src/components/ForecastIntelligence.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Brain, AlertTriangle, Activity } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
  Area,
} from "recharts";

import {
  createForecastV2CacheKey,
  getCachedForecastV2,
  setCachedForecastV2,
} from "../utils/forecastCacheV2";

function formatMoney(value) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function formatNumber(value) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString();
}

function formatPercent(value, digits = 1) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${(num * 100).toFixed(digits)}%`;
}

function formatStat(value, digits = 2) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(digits);
}

function formatSignedValue(value, isCountTarget) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const sign = num > 0 ? "+" : "";
  if (isCountTarget) return `${sign}${num.toFixed(2)}`;
  return `${sign}$${num.toFixed(2)}`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(String).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export default function ForecastIntelligence({ dailyData }) {
  const workerRef = useRef(null);

  const [config, setConfig] = useState({
    enabled: true,
    target: "cost", // "cost" | "executions"
    horizon: 30,
    confidence: 0.95,
    anomalyZ: 3.0,
    seasonality: "weekly", // "weekly" | "none"
    model: "auto", // "auto" | "seasonal_naive" | "drift" | "ses" | "holt" | "arima" | "ensemble"
    transform: "auto", // "auto" | "none" | "log1p"
    interval: "auto", // "auto" | "normal" | "empirical"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Create worker (separate from your existing one)
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/forecastIntelligenceWorker.js", import.meta.url),
      { type: "module" }
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const series = useMemo(() => {
    if (!Array.isArray(dailyData) || dailyData.length === 0) return null;

    const dates = dailyData.map((d) => d.date);
    const values =
      config.target === "executions"
        ? dailyData.map((d) => Number(d.uniqueExecutions) || 0)
        : dailyData.map((d) => Number(d.cost) || 0);

    return { dates, values };
  }, [dailyData, config.target]);

  const isCountTarget = config.target === "executions";
  const targetTitle = isCountTarget ? "Usage" : "Spend";
  const targetNoun = isCountTarget ? "usage" : "spend";
  const driversTitle = isCountTarget ? "Usage drivers and stability" : "Spend drivers and stability";
  const variabilityLabel = isCountTarget ? "Usage variability signals" : "Spend variability signals";
  const zeroLabel = isCountTarget ? "Zero-usage days" : "Zero-spend days";
  const shiftTitle = isCountTarget ? "Meaningful shifts in usage" : "Meaningful shifts in spend";
  const actualLabel = isCountTarget ? "Actual usage" : "Actual spend";
  const analysis = result?.analysis;
  const modelLeaderboard = result?.modelLeaderboard || [];

  const chartData = useMemo(() => {
    if (!result?.historyDates?.length) return [];

    const historyPoints = result.historyDates.map((date, i) => ({
      date,
      actual: result.historyValues?.[i] ?? null,
      forecast: null,
      lower: null,
      upper: null,
    }));

    const futurePoints = (result.forecastDates || []).map((date, i) => ({
      date,
      actual: null,
      forecast: result.forecast?.[i] ?? null,
      lower: result.ciLower?.[i] ?? null,
      upper: result.ciUpper?.[i] ?? null,
    }));

    return [...historyPoints, ...futurePoints];
  }, [result]);

  const summary = useMemo(() => {
    if (!result?.forecast?.length) return null;

    const horizon = result.forecast.length;
    const sum = result.forecast.reduce((a, b) => a + (Number(b) || 0), 0);

    // For a simple sum interval, assume independent daily errors:
    // sd(sum) ≈ sqrt(h) * sigma
    const sigma = Number(result.interval?.sigma ?? result.sigma) || 0;
    const z = config.confidence >= 0.99 ? 2.576 : 1.96;
    const sdSum = Math.sqrt(horizon) * sigma;

    const lowerSum = Math.max(0, sum - z * sdSum);
    const upperSum = Math.max(0, sum + z * sdSum);

    return { sum, lowerSum, upperSum, horizon };
  }, [result, config.confidence]);

  const friendlyNotes = useMemo(() => {
    const notes = result?.notes || [];
    if (!notes.length) return [];

    return notes.map((note) => {
      if (note.startsWith("Weekly seasonality: ON")) return "Weekly pattern: on";
      if (note.startsWith("Weekly seasonality: OFF")) return "Weekly pattern: off";
      if (note.startsWith("Variance stabilization: log1p")) return "Spike smoothing: on";
      if (note.startsWith("Variance stabilization: none")) return "Spike smoothing: off";
      if (note.startsWith("Interval method:")) {
        return `Range style:${note.replace("Interval method:", "")}`;
      }
      return note;
    });
  }, [result?.notes]);

  useEffect(() => {
    const run = async () => {
      if (!config.enabled) return;
      if (!workerRef.current) return;
      if (!series?.dates?.length) return;

      setError(null);
      setLoading(true);

      const cacheKey = createForecastV2CacheKey({
        dates: series.dates,
        values: series.values,
        horizon: config.horizon,
        confidence: config.confidence,
        anomalyZ: config.anomalyZ,
        seasonality: config.seasonality,
        model: config.model,
        transform: config.transform,
        interval: config.interval,
      });

      const cached = await getCachedForecastV2(cacheKey);
      if (cached) {
        setResult(cached);
        setLoading(false);
        return;
      }

      const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const onMessage = async (event) => {
        const payload = event.data;
        if (!payload || payload.requestId !== requestId) return;

        workerRef.current?.removeEventListener("message", onMessage);

        if (payload.error) {
          setError(payload.error);
          setResult(null);
          setLoading(false);
          return;
        }

        setResult(payload);
        setLoading(false);
        await setCachedForecastV2(cacheKey, payload);
      };

      workerRef.current.addEventListener("message", onMessage);

      workerRef.current.postMessage({
        requestId,
        dates: series.dates,
        values: series.values,
        horizon: config.horizon,
        confidence: config.confidence,
        anomalyZ: config.anomalyZ,
        seasonality: config.seasonality,
        model: config.model,
        transform: config.transform,
        interval: config.interval,
      });
    };

    run();
  }, [
    config.enabled,
    config.horizon,
    config.confidence,
    config.anomalyZ,
    config.seasonality,
    config.model,
    config.transform,
    config.interval,
    series,
  ]);

  const exportForecastCsv = () => {
    if (!result?.forecastDates?.length) return;

    const rows = [
      ["Date", "Forecast", "Low estimate", "High estimate"],
      ...result.forecastDates.map((d, i) => [
        d,
        (result.forecast?.[i] ?? "").toFixed?.(4) ?? result.forecast?.[i] ?? "",
        (result.ciLower?.[i] ?? "").toFixed?.(4) ?? result.ciLower?.[i] ?? "",
        (result.ciUpper?.[i] ?? "").toFixed?.(4) ?? result.ciUpper?.[i] ?? "",
      ]),
    ];

    const fileSafeTarget = config.target === "executions" ? "executions" : "cost";
    downloadCsv(
      `forecast_intelligence_${fileSafeTarget}_${new Date().toISOString().slice(0, 10)}.csv`,
      rows
    );
  };

  if (!dailyData?.length) return null;

  return (
    <div className="glass-card p-6 rounded-lg mt-6 border-l-4 border-slate-900 animate-slide-in">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-900 rounded-lg text-white">
            <Brain size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">
              {targetTitle} Forecast Insights
            </h3>
            <p className="text-xs text-gray-500">
              Projects future {targetNoun} and highlights unusual days based on historical usage.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportForecastCsv}
            disabled={!result?.forecastDates?.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-white text-gray-700 text-sm font-bold disabled:opacity-50"
            title="Download forecast CSV"
          >
            <Download size={16} /> Download forecast
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-3 mb-6">
        <label className="md:col-span-1 flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Show
        </label>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Forecast focus</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.target}
            onChange={(e) => setConfig((p) => ({ ...p, target: e.target.value }))}
          >
            <option value="cost">Daily spend</option>
            <option value="executions">Daily usage (runs)</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Forecast style</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.model}
            onChange={(e) => setConfig((p) => ({ ...p, model: e.target.value }))}
          >
            <option value="auto">Auto (recommended)</option>
            <option value="ensemble">Blended (balanced)</option>
            <option value="seasonal_naive">Repeat last week</option>
            <option value="drift">Trend line</option>
            <option value="ses">Smooth level</option>
            <option value="holt">Smooth trend</option>
            <option value="arima">Advanced</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Weekly pattern</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.seasonality}
            onChange={(e) => setConfig((p) => ({ ...p, seasonality: e.target.value }))}
          >
            <option value="weekly">On</option>
            <option value="none">Off</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Days ahead</div>
          <input
            type="number"
            min="1"
            max="365"
            value={config.horizon}
            onChange={(e) => setConfig((p) => ({ ...p, horizon: Number(e.target.value) || 30 }))}
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
          />
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Range confidence</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.confidence}
            onChange={(e) => setConfig((p) => ({ ...p, confidence: Number(e.target.value) }))}
          >
            <option value={0.9}>90% range</option>
            <option value={0.95}>95% range</option>
            <option value={0.99}>99% range</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Smooth spikes</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.transform}
            onChange={(e) => setConfig((p) => ({ ...p, transform: e.target.value }))}
          >
            <option value="auto">Auto</option>
            <option value="none">Off</option>
            <option value="log1p">On (log)</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1">Range style</div>
          <select
            className="w-full px-2 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={config.interval}
            onChange={(e) => setConfig((p) => ({ ...p, interval: e.target.value }))}
          >
            <option value="auto">Auto</option>
            <option value="normal">Standard</option>
            <option value="empirical">Data-driven</option>
          </select>
        </div>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
        {loading && <span className="text-gray-500">Forecasting…</span>}
        {error && (
          <span className="text-red-600 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </span>
        )}
        {result?.selectedModel?.label && (
          <span className="text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
            <span className="font-bold">Best fit:</span>{" "}
            {result.selectedModel.label}
            {result.selectedModel?.params &&
              Object.keys(result.selectedModel.params).length > 0 && (
                <span className="text-gray-500">
                  {" "}
                  ({Object.entries(result.selectedModel.params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")})
                </span>
              )}
          </span>
        )}
        {!!result?.notes?.length && (
          <span className="text-gray-500">
            {friendlyNotes.join(" • ")}
          </span>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">
              Expected total next {summary.horizon} days
            </div>
            <div className="text-2xl font-extrabold text-gray-900">
              {isCountTarget ? formatNumber(summary.sum) : formatMoney(summary.sum)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">
              Low estimate (~{Math.round(config.confidence * 100)}%)
            </div>
            <div className="text-2xl font-extrabold text-gray-900">
              {isCountTarget ? formatNumber(summary.lowerSum) : formatMoney(summary.lowerSum)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase mb-1">
              High estimate (~{Math.round(config.confidence * 100)}%)
            </div>
            <div className="text-2xl font-extrabold text-gray-900">
              {isCountTarget ? formatNumber(summary.upperSum) : formatMoney(summary.upperSum)}
            </div>
          </div>
        </div>
      )}

      {/* Forecast chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-gray-800 flex items-center gap-2">
            <Activity size={18} className="text-gray-400" /> Expected range
          </div>
          {result?.backtest?.metrics && (
            <div className="text-xs text-gray-500">
              Accuracy check ({result.backtest.window}d, lower is better):{" "}
              <span className="font-bold">
                Error {isCountTarget ? formatNumber(result.backtest.metrics.rmse) : formatMoney(result.backtest.metrics.rmse)}
              </span>{" "}
              • Avg miss{" "}
              <span className="font-bold">
                {isCountTarget ? formatNumber(result.backtest.metrics.mae) : formatMoney(result.backtest.metrics.mae)}
              </span>{" "}
              • Percent miss{" "}
              <span className="font-bold">
                {Number(result.backtest.metrics.smape)?.toFixed?.(1) ?? "—"}%
              </span>{" "}
              {result.backtest.metrics.mase != null && (
                <>
                  • Relative miss <span className="font-bold">{formatStat(result.backtest.metrics.mase, 2)}</span>
                </>
              )}
              {result.analysis?.residualDiagnostics?.intervalCoverage != null && (
                <>
                  {" "}
                  • Range hit{" "}
                  <span className="font-bold">
                    {formatPercent(result.analysis.residualDiagnostics.intervalCoverage, 0)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) => (isCountTarget ? formatNumber(v) : `$${v}`)}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (value == null || Number.isNaN(Number(value))) return ["—", name];
                  const num = Number(value);
                  const label =
                    name === "actual"
                      ? actualLabel
                      : name === "forecast"
                      ? "Forecast"
                      : name === "lower"
                      ? "Low estimate"
                      : "High estimate";

                  return [
                    isCountTarget ? formatNumber(num) : formatMoney(num),
                    label,
                  ];
                }}
              />
              <Legend />
              <Bar dataKey="actual" name={actualLabel} radius={[4, 4, 0, 0]} />
              <Area dataKey="upper" name="High estimate" type="monotone" dot={false} />
              <Area dataKey="lower" name="Low estimate" type="monotone" dot={false} />
              <Line dataKey="forecast" name="Forecast" type="monotone" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model leaderboard */}
      {!!modelLeaderboard.length && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-gray-800">Forecast method comparison</div>
            <div className="text-xs text-gray-500">Ranked by accuracy (lower is better)</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Error score</th>
                  <th className="px-3 py-2 text-right">Avg miss</th>
                  <th className="px-3 py-2 text-right">Percent miss</th>
                  <th className="px-3 py-2 text-right">Relative miss</th>
                  <th className="px-3 py-2 text-right">Blend weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {modelLeaderboard.slice(0, 8).map((m) => {
                  const isSelected = m.id === result?.selectedModel?.id;
                  return (
                    <tr key={m.id} className={isSelected ? "bg-emerald-50" : "hover:bg-gray-50"}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {m.label}
                        {isSelected && <span className="ml-2 text-xs text-emerald-700 font-bold">Best fit</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {isCountTarget ? formatNumber(m.metrics?.rmse) : formatMoney(m.metrics?.rmse)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {isCountTarget ? formatNumber(m.metrics?.mae) : formatMoney(m.metrics?.mae)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {m.metrics?.smape != null ? `${Number(m.metrics.smape).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {m.metrics?.mase != null ? formatStat(m.metrics.mase, 2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {m.weight != null ? formatPercent(m.weight, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statistical deep dive */}
      {analysis && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-gray-800">{driversTitle}</div>
            <div className="text-xs text-gray-500">
              {analysis.summary?.n ?? "—"} data points • {analysis.summary?.missingDays ?? "—"} filled days
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Daily trend (change per day)</div>
              <div className="text-lg font-extrabold text-gray-900">
                {formatSignedValue(analysis.trend?.slopePerDay, isCountTarget)}
              </div>
              <div className="text-xs text-gray-500">
                Fit score (0-1) {formatStat(analysis.trend?.r2, 2)} • Strength {formatStat(analysis.trend?.tStat, 2)}
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Last 7 days vs prior 7 days</div>
              <div className="text-lg font-extrabold text-gray-900">
                {formatPercent(analysis.trend?.pctChange7, 1)}
              </div>
              <div className="text-xs text-gray-500">
                Last {isCountTarget ? formatNumber(analysis.trend?.last7Mean) : formatMoney(analysis.trend?.last7Mean)} •
                Prev {isCountTarget ? formatNumber(analysis.trend?.prev7Mean) : formatMoney(analysis.trend?.prev7Mean)}
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Weekly pattern strength</div>
              <div className="text-lg font-extrabold text-gray-900">
                {formatPercent(analysis.seasonality?.strength, 0)}
              </div>
              <div className="text-xs text-gray-500">
                Weekly swing{" "}
                {isCountTarget
                  ? formatNumber(analysis.seasonality?.amplitude)
                  : formatMoney(analysis.seasonality?.amplitude)}
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Volatility (last 7 days)</div>
              <div className="text-lg font-extrabold text-gray-900">
                {isCountTarget
                  ? formatNumber(analysis.volatility?.rollingStd7Last)
                  : formatMoney(analysis.volatility?.rollingStd7Last)}
              </div>
              <div className="text-xs text-gray-500">
                Avg{" "}
                {isCountTarget
                  ? formatNumber(analysis.volatility?.rollingStd7Mean)
                  : formatMoney(analysis.volatility?.rollingStd7Mean)}{" "}
                • vs overall {formatStat(analysis.volatility?.volRatio, 2)}x
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">{variabilityLabel}</div>
              <div className="text-lg font-extrabold text-gray-900">
                Skew (spikes) {formatStat(analysis.summary?.skewness, 2)}
              </div>
              <div className="text-xs text-gray-500">
                Tail risk {formatStat(analysis.summary?.kurtosis, 2)} • Spread {formatStat(analysis.summary?.cv, 2)}
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-1">Data coverage</div>
              <div className="text-lg font-extrabold text-gray-900">
                {zeroLabel} {formatPercent(analysis.summary?.zeroRatio, 0)}
              </div>
              <div className="text-xs text-gray-500">
                Missing {analysis.summary?.missingDays ?? "—"} • Range {analysis.summary?.startDate} to{" "}
                {analysis.summary?.endDate}
              </div>
            </div>
          </div>

          {analysis.residualDiagnostics && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Avg error</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {formatSignedValue(analysis.residualDiagnostics.bias, isCountTarget)}
                </div>
                <div className="text-xs text-gray-500">Forecast bias</div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Relative error</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {analysis.residualDiagnostics.mase != null
                    ? formatStat(analysis.residualDiagnostics.mase, 2)
                    : "—"}
                </div>
                <div className="text-xs text-gray-500">Lower is better</div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Pattern check</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {formatStat(analysis.residualDiagnostics.durbinWatson, 2)}
                </div>
                <div className="text-xs text-gray-500">
                  Pattern score {formatStat(analysis.residualDiagnostics.ljungBoxQ, 1)}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Distribution check</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {formatStat(analysis.residualDiagnostics.jarqueBera, 2)}
                </div>
                <div className="text-xs text-gray-500">Consistency score</div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 uppercase mb-1">Range hit rate</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {formatPercent(analysis.residualDiagnostics.intervalCoverage, 0)}
                </div>
                <div className="text-xs text-gray-500">Actuals inside range</div>
              </div>
            </div>
          )}

          {!!analysis.autocorrelation?.acf?.length && (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">
                Recurring pattern by lag (days 1-{analysis.autocorrelation.maxLag})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {analysis.autocorrelation.acf.map((value, index) => {
                  const width = Math.min(100, Math.abs(value) * 100);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-8">L{index + 1}</span>
                      <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                        <div
                          className={`h-2 ${value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-600 w-12 text-right">
                        {formatStat(value, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!!analysis.changePoints?.length && (
            <div className="mt-4">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">{shiftTitle}</div>
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Before avg</th>
                      <th className="px-3 py-2 text-right">After avg</th>
                      <th className="px-3 py-2 text-right">Change</th>
                      <th className="px-3 py-2 text-right">Signal strength</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analysis.changePoints.map((point) => (
                      <tr key={`${point.date}_${point.index}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{point.date}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {isCountTarget ? formatNumber(point.beforeMean) : formatMoney(point.beforeMean)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {isCountTarget ? formatNumber(point.afterMean) : formatMoney(point.afterMean)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatSignedValue(point.delta, isCountTarget)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {formatStat(point.z, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Anomalies */}
      {!!result?.anomalies?.length && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="font-bold text-gray-800 mb-3">
            Unusual days (outside expected range)
          </div>
          <div className="overflow-auto max-h-[260px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Expected level</th>
                  <th className="px-3 py-2 text-right">Signal strength</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.anomalies.slice(0, 50).map((a) => (
                  <tr key={`${a.date}_${a.index}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{a.date}</td>
                    <td className="px-3 py-2 text-right">
                      {isCountTarget ? formatNumber(a.actual) : formatMoney(a.actual)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {isCountTarget ? formatNumber(a.expected) : formatMoney(a.expected)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(a.z).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Tip: review launches, policy changes, or one-off events around these dates.
          </div>
        </div>
      )}
    </div>
  );
}
