import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createSeriesCacheKey, getCachedForecast, setCachedForecast } from "../utils/forecastCache";
import ForecastIntelligence from "./ForecastIntelligence";

import {
    UploadCloud, FileSpreadsheet, X,
    TrendingUp, Layers, Users, Server,
    Filter, Calendar, Search, ArrowUp, ArrowDown, ArrowUpDown,
    Cpu
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, Line, ComposedChart
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export default function DailyUsage({ pricing = {} }) {
    const [fileName, setFileName] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [rowCount, setRowCount] = useState(0);

    // Filter & Data States
    const rawDataRef = useRef([]); // Stores optimized raw rows
    const [stats, setStats] = useState(null);

    // Available options for filters (populated on load)
    const [availableOptions, setAvailableOptions] = useState({
        departments: [],
        models: []
    });

    // Active Filters
    const [filters, setFilters] = useState({
        dateRange: 'all', // '7', '30', 'all'
        departments: [],  // Multi-select array
        user: '',         // Search text
        model: 'all',     // Dropdown
        minCost: 0        // Slider
    });

    // Sort Configuration
    const [sortConfig, setSortConfig] = useState({
        daily: { key: 'date', direction: 'asc' },
        dept: { key: 'cost', direction: 'desc' },
        user: { key: 'cost', direction: 'desc' },
        node: { key: 'cost', direction: 'desc' }
    });


    const forecastWorkerRef = useRef(null);

    const [forecastConfig, setForecastConfig] = useState({
        enabled: true,
        horizon: 14,
        confidence: 0.95,
        anomalyZ: 3.0,
    });

    const [forecastResult, setForecastResult] = useState(null);
    const [forecastError, setForecastError] = useState(null);
    const [forecastLoading, setForecastLoading] = useState(false);

    useEffect(() => {
        forecastWorkerRef.current = new Worker(
            new URL("../workers/forecastWorker.js", import.meta.url),
            { type: "module" }
        );

        return () => {
            forecastWorkerRef.current?.terminate();
            forecastWorkerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const runForecast = async () => {
            if (!stats?.dailyData?.length) return;
            if (!forecastConfig.enabled) return;
            if (!forecastWorkerRef.current) return;

            setForecastError(null);
            setForecastLoading(true);

            const dates = stats.dailyData.map(d => d.date);
            const values = stats.dailyData.map(d => Number(d.cost) || 0);

            const cacheKey = createSeriesCacheKey({
                dates,
                values,
                horizon: forecastConfig.horizon,
                confidence: forecastConfig.confidence,
                anomalyZ: forecastConfig.anomalyZ,
            });

            const cached = await getCachedForecast(cacheKey);
            if (cached) {
                setForecastResult(cached);
                setForecastLoading(false);
                return;
            }

            const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

            const handleMessage = async (event) => {
                const payload = event.data;
                if (!payload || payload.requestId !== requestId) return;

                forecastWorkerRef.current?.removeEventListener("message", handleMessage);

                if (payload.error) {
                    setForecastError(payload.error);
                    setForecastResult(null);
                    setForecastLoading(false);
                    return;
                }

                setForecastResult(payload);
                setForecastLoading(false);
                await setCachedForecast(cacheKey, payload);
            };

            forecastWorkerRef.current.addEventListener("message", handleMessage);

            forecastWorkerRef.current.postMessage({
                requestId,
                dates,
                values,
                horizon: forecastConfig.horizon,
                confidence: forecastConfig.confidence,
                anomalyZ: forecastConfig.anomalyZ,
            });
        };

        runForecast();
    }, [stats, forecastConfig.enabled, forecastConfig.horizon, forecastConfig.confidence, forecastConfig.anomalyZ]);

    const trendData = useMemo(() => {
        if (!stats?.dailyData?.length) return [];
        const shouldShowForecast = forecastConfig.enabled && forecastResult?.forecast?.length;

        const base = stats.dailyData.map((d, i) => ({
            date: d.date,
            actualCost: d.cost,
            // Keep existing fields if you want (cumulativeCost etc.)
            cumulativeCost: d.cumulativeCost,
            modelCost: shouldShowForecast ? forecastResult?.fitted?.[i] ?? null : null,
        }));

        if (!shouldShowForecast) return base;

        const future = forecastResult.forecast.map((y, idx) => ({
            date: forecastResult.forecastDates?.[idx] ?? `+${idx + 1}`,
            actualCost: null,
            cumulativeCost: null,
            modelCost: y,
            ciLower: forecastResult.ciLower?.[idx] ?? null,
            ciUpper: forecastResult.ciUpper?.[idx] ?? null,
        }));

        return [...base, ...future];
    }, [stats, forecastResult, forecastConfig.enabled]);

    const showForecast = forecastConfig.enabled && !!forecastResult?.forecast?.length;

    useEffect(() => {
        if (!forecastConfig.enabled) {
            setForecastLoading(false);
            setForecastError(null);
            setForecastResult(null);
        }
    }, [forecastConfig.enabled]);


    // Helper: Sort Function
    const getSortedData = (data, tableKey) => {
        const config = sortConfig[tableKey];
        if (!data || !config) return data;

        return [...data].sort((a, b) => {
            let aVal = a[config.key];
            let bVal = b[config.key];

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    // Helper: Toggle Sort
    const handleSort = (key, table) => {
        setSortConfig(prev => ({
            ...prev,
            [table]: {
                key,
                direction: prev[table].key === key && prev[table].direction === 'desc' ? 'asc' : 'desc'
            }
        }));
    };

    const optimizeRow = (row, pricing) => {
        // Guard against missing pricing data
        if (!pricing || !pricing.openai) return null;

        // Safe Key Finding
        const findKey = (obj, target) => Object.keys(obj).find(k => k.toLowerCase().trim() === target.toLowerCase().trim());

        const modelRaw = row[findKey(row, 'Model')] || 'unknown';
        const department = row[findKey(row, 'Department')] || 'Unassigned';
        const user = row[findKey(row, 'User')] || 'Unknown';
        const executionId = row[findKey(row, 'Unique')] || row[findKey(row, 'Execution ID')];
        const timeStr = row[findKey(row, 'Time')];
        const nodeName = row[findKey(row, 'Node Name')] || 'Unknown Node';

        const input = parseFloat(row[findKey(row, 'Input Tokens')] || 0);
        const output = parseFloat(row[findKey(row, 'Output Tokens')] || 0);
        const cached = parseFloat(row[findKey(row, 'Cached Tokens')] || row[findKey(row, 'Cache')] || 0);

        // Calculate Cost
        let modelPriceKey = Object.keys(pricing.openai).find(k => modelRaw.includes(k));
        // Fallback to default if model not found
        const rates = (modelPriceKey && pricing.openai[modelPriceKey]) || { input: 0, output: 0, cached: 0 };
        const freshInput = Math.max(0, input - cached);

        const cost = ((freshInput / 1e6) * rates.input) +
            ((cached / 1e6) * (rates.cached || rates.input)) +
            ((output / 1e6) * rates.output);

        const dateObj = timeStr ? new Date(timeStr) : new Date();

        // Return Minified Object for Memory Efficiency
        return {
            id: executionId,
            ts: dateObj.getTime(), // Timestamp for fast date filtering
            date: dateObj.toISOString().split('T')[0],
            dpt: department,
            usr: user,
            mdl: modelRaw,
            nd: nodeName.trim(),
            c: cost,
            t: input + output
        };
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check if pricing is loaded
        if (!pricing || !pricing.openai) {
            setError("Pricing configuration is missing. Please verify settings.");
            return;
        }

        setFileName(file.name);
        setProcessing(true);
        setError(null);
        setRowCount(0);
        rawDataRef.current = []; // Clear previous data

        // Temporary Sets for filter population
        const depts = new Set();
        const models = new Set();

        const reader = new FileReader();

        reader.onload = (event) => {
            const text = event.target.result;
            // Split by newline
            const lines = text.split('\n');

            if (lines.length === 0) {
                setProcessing(false);
                setError("File is empty");
                return;
            }

            // Parse Headers
            const headers = lines[0].split(',').map(h => h.trim());

            let processedCount = 0;
            let currentIndex = 1; // Skip header
            const totalLines = lines.length;
            const CHUNK_SIZE = 5000; // Process in chunks to avoid freezing UI

            // Custom Parsing Loop
            const processChunk = () => {
                const chunkEnd = Math.min(currentIndex + CHUNK_SIZE, totalLines);

                for (let i = currentIndex; i < chunkEnd; i++) {
                    const line = lines[i];
                    if (!line || !line.trim()) continue;

                    // Simple split (handles standard CSVs)
                    const values = line.split(',');
                    const row = {};
                    headers.forEach((h, idx) => {
                        // Strip quotes if present
                        let val = values[idx] || '';
                        if (val.startsWith('"') && val.endsWith('"')) {
                            val = val.slice(1, -1);
                        }
                        row[h] = val.trim();
                    });

                    processedCount++;

                    // Optimize Row immediately
                    const processedRow = optimizeRow(row, pricing);
                    if (processedRow) {
                        rawDataRef.current.push(processedRow);
                        if (processedRow.dpt) depts.add(processedRow.dpt);
                        if (processedRow.mdl) models.add(processedRow.mdl);
                    }
                }

                currentIndex = chunkEnd;
                setRowCount(processedCount);

                if (currentIndex < totalLines) {
                    // Schedule next chunk
                    setTimeout(processChunk, 0);
                } else {
                    // All Done
                    setAvailableOptions({
                        departments: Array.from(depts).sort(),
                        models: Array.from(models).sort()
                    });

                    recalculateStats(); // Initial calculation
                    setProcessing(false);
                }
            };

            // Start processing
            processChunk();
        };

        reader.onerror = () => {
            console.error(reader.error);
            setError("Failed to read file.");
            setProcessing(false);
        };

        reader.readAsText(file);
    };

    // The heavy lifter: Aggregates filtered data
    const recalculateStats = () => {
        const allRows = rawDataRef.current;
        if (allRows.length === 0) return;

        // 1. Filter
        const now = new Date();
        let cutoffTime = 0;
        if (filters.dateRange === '7') cutoffTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        if (filters.dateRange === '30') cutoffTime = now.getTime() - (30 * 24 * 60 * 60 * 1000);

        const activeDepts = new Set(filters.departments);
        const searchUser = filters.user.toLowerCase();

        const filteredRows = allRows.filter(r => {
            if (cutoffTime > 0 && r.ts < cutoffTime) return false;
            if (filters.departments.length > 0 && !activeDepts.has(r.dpt)) return false;
            if (filters.model !== 'all' && r.mdl !== filters.model) return false;
            if (filters.minCost > 0 && r.c < filters.minCost) return false;
            if (searchUser && !r.usr.toLowerCase().includes(searchUser)) return false;
            return true;
        });

        // 2. Aggregate
        const tempStats = {
            totalCost: 0,
            totalTokens: 0,
            uniqueExecutions: new Set(),
            dailyMap: {},
            deptMap: {},
            userMap: {},
            nodeMap: {}
        };

        // Determine date range for average calculations
        const uniqueDates = new Set();

        filteredRows.forEach(r => {
            tempStats.totalCost += r.c;
            tempStats.totalTokens += r.t;
            if (r.id) tempStats.uniqueExecutions.add(r.id);
            uniqueDates.add(r.date);

            // Daily
            if (!tempStats.dailyMap[r.date]) tempStats.dailyMap[r.date] = { cost: 0, tokens: 0, executionIds: new Set() };
            tempStats.dailyMap[r.date].cost += r.c;
            tempStats.dailyMap[r.date].executionIds.add(r.id);

            // Dept
            if (!tempStats.deptMap[r.dpt]) tempStats.deptMap[r.dpt] = { cost: 0, tokens: 0, executionIds: new Set() };
            tempStats.deptMap[r.dpt].cost += r.c;
            tempStats.deptMap[r.dpt].executionIds.add(r.id);

            // User
            if (!tempStats.userMap[r.usr]) tempStats.userMap[r.usr] = { cost: 0, tokens: 0, department: r.dpt, executionIds: new Set() };
            tempStats.userMap[r.usr].cost += r.c;
            tempStats.userMap[r.usr].tokens += r.t;
            tempStats.userMap[r.usr].executionIds.add(r.id);

            // Node
            const nodeKey = `${r.nd} (${r.mdl})`;
            if (!tempStats.nodeMap[nodeKey]) tempStats.nodeMap[nodeKey] = { name: r.nd, model: r.mdl, cost: 0, rowCount: 0 };
            tempStats.nodeMap[nodeKey].cost += r.c;
            tempStats.nodeMap[nodeKey].rowCount += 1;
        });

        const dayCount = uniqueDates.size || 1;

        // 3. Flatten for Charts/Tables
        let runningTotal = 0;
        const dailyData = Object.entries(tempStats.dailyMap)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, data]) => {
                runningTotal += data.cost;
                return {
                    date,
                    cost: data.cost,
                    uniqueExecutions: data.executionIds.size,
                    cumulativeCost: runningTotal
                };
            });

        const departmentData = Object.entries(tempStats.deptMap)
            .map(([name, data]) => ({
                name,
                cost: data.cost,
                pct: (data.cost / tempStats.totalCost) * 100,
                uniqueExecutions: data.executionIds.size,
                avgDaily: data.cost / dayCount
            }));

        const userData = Object.entries(tempStats.userMap)
            .map(([name, data]) => ({
                name,
                cost: data.cost,
                tokens: data.tokens,
                department: data.department,
                uniqueExecutions: data.executionIds.size
            }));
        // Sort later in UI

        const nodeData = Object.values(tempStats.nodeMap);
        // Sort later in UI

        setStats({
            totalCost: tempStats.totalCost,
            totalTokens: tempStats.totalTokens,
            totalUniqueExecutions: tempStats.uniqueExecutions.size,
            dailyData,
            departmentData,
            userData,
            nodeData
        });
    };

    // Effect: Trigger recalculation when filters change
    useEffect(() => {
        if (rawDataRef.current.length > 0) {
            // Debounce for performance if dragging slider
            const timer = setTimeout(() => {
                recalculateStats();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [filters]);

    const handleReset = () => {
        setStats(null);
        setFileName(null);
        setRowCount(0);
        setError(null);
        rawDataRef.current = [];
        setFilters({
            dateRange: 'all',
            departments: [],
            user: '',
            model: 'all',
            minCost: 0
        });
    };

    // Helper Component for Sort Headers
    const SortHeader = ({ label, tableKey, colKey, align = 'left' }) => {
        const isActive = sortConfig[tableKey].key === colKey;
        return (
            <th
                className={`group px-4 py-3 cursor-pointer transition-colors select-none ${isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100'}`}
                onClick={() => handleSort(colKey, tableKey)}
                style={{ textAlign: align }}
            >
                <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    {label}
                    <span className="text-gray-400">
                        {isActive ? (
                            sortConfig[tableKey].direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        ) : (
                            <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50" />
                        )}
                    </span>
                </div>
            </th>
        );
    };

    // Derived sorted data for tables
    const sortedDeptData = useMemo(() => getSortedData(stats?.departmentData, 'dept'), [stats, sortConfig.dept]);
    const sortedUserData = useMemo(() => getSortedData(stats?.userData, 'user')?.slice(0, 100), [stats, sortConfig.user]);
    const sortedNodeData = useMemo(() => getSortedData(stats?.nodeData, 'node')?.slice(0, 50), [stats, sortConfig.node]);

    return (
        <div className="space-y-6 animate-slide-in pb-12">

            {/* 1. Upload Area */}
            {!stats && !processing && (
                <div className="bg-white p-12 rounded-xl shadow-sm border-2 border-dashed border-gray-300 text-center hover:border-indigo-400 transition-colors">
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="fileUpload" />
                    <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center justify-center gap-4">
                        <div className="bg-indigo-50 p-6 rounded-full">
                            <UploadCloud size={48} className="text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Upload AI Usage Report</h3>
                            <p className="text-gray-500 mt-2">
                                Optimized for large exports (1M+ rows).<br />
                                <span className="font-bold text-indigo-600">Please upload CSV files only.</span>
                            </p>
                        </div>
                    </label>
                    {error && <div className="mt-6 p-3 bg-red-50 text-red-600 rounded">{error}</div>}
                </div>
            )}

            {/* 2. Processing State */}
            {processing && (
                <div className="text-center p-12 bg-white rounded-xl shadow-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <h3 className="text-lg font-bold text-gray-800">Summarizing usage and spend...</h3>
                    <p className="text-gray-500 mb-2">{fileName}</p>
                    <div className="text-2xl font-mono font-bold text-indigo-600">
                        {rowCount.toLocaleString()} records processed
                    </div>
                </div>
            )}

            {/* 3. Dashboard */}
            {stats && (
                <>
                    {/* Header Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded text-green-700">
                                <FileSpreadsheet size={20} />
                            </div>
                            <div>
                                <h2 className="font-bold text-gray-800">{fileName}</h2>
                                <p className="text-xs text-gray-500">{rowCount.toLocaleString()} records processed</p>
                            </div>
                        </div>
                        <button
                            onClick={handleReset}
                            className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <X size={16} /> Reset Data
                        </button>
                    </div>

                    {/* FILTER BAR - New Feature */}
                    <div className="glass-card p-4 rounded-lg flex flex-col lg:flex-row gap-4 items-center justify-between border-l-4 border-indigo-500">
                        <div className="flex items-center gap-2 text-indigo-900 font-bold shrink-0">
                            <Filter size={20} /> Refine view
                        </div>

                        <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                            {/* Date Range */}
                            <div className="relative group">
                                <Calendar size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <select
                                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none hover:border-indigo-300 transition-colors cursor-pointer appearance-none min-w-[140px]"
                                    value={filters.dateRange}
                                    onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                                >
                                    <option value="all">All Time</option>
                                    <option value="7">Last 7 Days</option>
                                    <option value="30">Last 30 Days</option>
                                </select>
                            </div>

                            {/* Department - Multi-select Simulation via Dropdown */}
                            <div className="relative">
                                <Layers size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <select
                                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none hover:border-indigo-300 transition-colors cursor-pointer appearance-none min-w-[160px]"
                                    value={filters.departments.length ? filters.departments[0] : 'all'}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFilters({ ...filters, departments: val === 'all' ? [] : [val] });
                                    }}
                                >
                                    <option value="all">All Departments</option>
                                    {availableOptions.departments.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>

                                {filters.departments.length > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                        {filters.departments.length}
                                    </span>
                                )}
                            </div>

                            {/* User Search */}
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search person or team..."
                                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-w-[160px]"
                                    value={filters.user}
                                    onChange={(e) => setFilters({ ...filters, user: e.target.value })}
                                />
                            </div>

                            {/* Model */}
                            <div className="relative">
                                <Cpu size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <select
                                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none min-w-[160px]"
                                    value={filters.model}
                                    onChange={(e) => setFilters({ ...filters, model: e.target.value })}
                                >
                                    <option value="all">All AI Models</option>
                                    {availableOptions.models.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Min Cost Slider */}
                            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-md">
                                <span className="text-xs font-medium text-gray-500">Min $/day</span>
                                <input
                                    type="range" min="0" max="100" step="1"
                                    className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    value={filters.minCost}
                                    onChange={(e) => setFilters({ ...filters, minCost: parseFloat(e.target.value) })}
                                />
                                <span className="text-xs font-bold text-indigo-600 w-8">${filters.minCost}</span>
                            </div>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-card p-6 rounded-lg border-l-4 border-indigo-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Total AI spend (estimate)</p>
                            <div className="text-3xl font-bold text-gray-900">${stats.totalCost.toFixed(2)}</div>
                            <p className="text-xs text-gray-400 mt-1">Based on configured pricing</p>
                        </div>
                        <div className="glass-card p-6 rounded-lg border-l-4 border-emerald-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Usage volume (text units)</p>
                            <div className="text-3xl font-bold text-gray-900">{(stats.totalTokens / 1e6).toFixed(2)}M</div>
                            <p className="text-xs text-gray-400 mt-1">Higher volume usually means higher cost</p>
                        </div>
                        <div className="glass-card p-6 rounded-lg border-l-4 border-blue-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Automation runs</p>
                            <div className="text-3xl font-bold text-gray-900">{stats.totalUniqueExecutions.toLocaleString()}</div>
                            <p className="text-xs text-gray-400 mt-1">Distinct workflow executions</p>
                        </div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-3 items-center">
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={forecastConfig.enabled}
                                onChange={(e) => setForecastConfig((p) => ({ ...p, enabled: e.target.checked }))}
                            />
                            Show spend forecast
                        </label>

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Days ahead</span>
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={forecastConfig.horizon}
                                onChange={(e) => setForecastConfig((p) => ({ ...p, horizon: Number(e.target.value) || 14 }))}
                                className="w-20 px-2 py-1 border border-gray-200 rounded"
                            />
                        </div>

                        <select
                            value={forecastConfig.confidence}
                            onChange={(e) => setForecastConfig((p) => ({ ...p, confidence: Number(e.target.value) }))}
                            className="px-2 py-1 border border-gray-200 rounded text-sm"
                        >
                            <option value={0.95}>95% range</option>
                            <option value={0.99}>99% range</option>
                        </select>

                        {forecastLoading && <span className="text-xs text-gray-400">Forecasting…</span>}
                        {forecastError && <span className="text-xs text-red-600">{forecastError}</span>}
                    </div>


                    {/* Main Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Daily Trend */}
                        <div className="lg:col-span-2 glass-card p-6 rounded-lg">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <TrendingUp size={18} className="text-gray-400" /> Daily AI spend
                            </h3>
                            <p className="text-xs text-gray-500 -mt-4 mb-4">
                                Bars show actual daily spend. Lines show forecast and expected range.
                            </p>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis yAxisId="left" orientation="left" tickFormatter={(v) => `$${v}`} />
                                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} />
                                        <Tooltip
                                            formatter={(value, name) => {
                                                if (value == null || Number.isNaN(Number(value))) return ["—", name];
                                                const num = Number(value);
                                                const label =
                                                    name === "cumulativeCost" ? "Total to date" :
                                                        name === "actualCost" ? "Daily spend" :
                                                            name === "modelCost" ? "Forecast" :
                                                                name === "ciUpper" ? "High estimate" :
                                                                    name === "ciLower" ? "Low estimate" :
                                                                        name;
                                                return [`$${num.toFixed(2)}`, label];
                                            }}
                                        />

                                        <Legend />
                                        <Bar yAxisId="left" dataKey="actualCost" name="Daily spend" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                        {showForecast && (
                                            <>
                                                <Line yAxisId="left" type="monotone" dataKey="modelCost" name="Forecast" strokeWidth={2} dot={false} />
                                                <Line yAxisId="left" type="monotone" dataKey="ciUpper" name="High estimate" strokeDasharray="4 4" dot={false} />
                                                <Line yAxisId="left" type="monotone" dataKey="ciLower" name="Low estimate" strokeDasharray="4 4" dot={false} />
                                            </>
                                        )}

                                        {/* Keep your cumulative line if you want historical-only */}
                                        <Line yAxisId="right" type="monotone" dataKey="cumulativeCost" name="Total to date" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Department Pie */}
                        <div className="glass-card p-6 rounded-lg">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <Layers size={18} className="text-gray-400" /> Spend by department
                            </h3>
                            <p className="text-xs text-gray-500 -mt-4 mb-4">
                                Share of total spend by team.
                            </p>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stats.departmentData}
                                            cx="50%" cy="50%"
                                            innerRadius={60} outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="cost"
                                        >
                                            {stats.departmentData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(val) => `$${val.toFixed(2)}`} />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* NEW: Detailed Department Breakdown Table */}
                    <div className="glass-card p-6 rounded-lg animate-slide-in">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Layers size={18} className="text-gray-400" /> Department spend details
                        </h3>
                        <div className="overflow-auto max-h-[300px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <SortHeader tableKey="dept" colKey="name" label="Department" />
                                        <SortHeader tableKey="dept" colKey="cost" label="Total spend" align="right" />
                                        <SortHeader tableKey="dept" colKey="pct" label="Share of spend" align="right" />
                                        <SortHeader tableKey="dept" colKey="uniqueExecutions" label="Runs" align="right" />
                                        <SortHeader tableKey="dept" colKey="avgDaily" label="Avg daily spend" align="right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedDeptData.map((d, i) => (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-gray-900">{d.name}</td>
                                            <td className="px-4 py-2 text-right text-indigo-600 font-bold">${d.cost.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right text-gray-600">{d.pct.toFixed(1)}%</td>
                                            <td className="px-4 py-2 text-right font-mono text-xs">{d.uniqueExecutions.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right text-gray-500">${d.avgDaily.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Top Users Table */}
                    <div className="glass-card p-6 rounded-lg">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-gray-400" /> Top people by spend
                        </h3>
                        <div className="overflow-auto max-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <SortHeader tableKey="user" colKey="name" label="Person" />
                                        <SortHeader tableKey="user" colKey="department" label="Department" />
                                        <SortHeader tableKey="user" colKey="uniqueExecutions" label="Runs" align="right" />
                                        <SortHeader tableKey="user" colKey="tokens" label="Usage volume (tokens)" align="right" />
                                        <SortHeader tableKey="user" colKey="cost" label="Spend" align="right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedUserData.map((u, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium text-gray-900">{u.name}</td>
                                            <td className="px-4 py-2 text-gray-500">
                                                <span className="bg-gray-100 px-2 py-1 rounded text-xs">{u.department}</span>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-xs">{u.uniqueExecutions}</td>
                                            <td className="px-4 py-2 text-right text-gray-500 text-xs">{u.tokens.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right font-bold text-indigo-600">${u.cost.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                            Usage volume reflects text processed; spend is the direct cost impact.
                        </div>
                    </div>

                    {/* Top Nodes Table */}
                    <div className="glass-card p-6 rounded-lg">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Server size={18} className="text-gray-400" /> Top workflow steps by spend
                        </h3>
                        <div className="overflow-auto max-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <SortHeader tableKey="node" colKey="name" label="Workflow step" />
                                        <SortHeader tableKey="node" colKey="model" label="AI model" />
                                        <SortHeader tableKey="node" colKey="rowCount" label="Runs" align="right" />
                                        <SortHeader tableKey="node" colKey="cost" label="Spend" align="right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {sortedNodeData.map((n, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium text-gray-900">{n.name}</td>
                                            <td className="px-4 py-2 text-blue-600 text-xs">{n.model}</td>
                                            <td className="px-4 py-2 text-right font-mono text-xs">{n.rowCount.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right font-bold text-indigo-600">${n.cost.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                            Workflow steps are the AI nodes inside your automations.
                        </div>
                    </div>
                    <ForecastIntelligence dailyData={stats.dailyData} />
                </>
            )}
        </div>
    );
}
