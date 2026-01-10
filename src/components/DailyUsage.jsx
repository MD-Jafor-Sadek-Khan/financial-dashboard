import React, { useState } from 'react';
import Papa from 'papaparse';
import {
    UploadCloud, FileSpreadsheet, X, // <--- Added FileSpreadsheet here
    TrendingUp, Layers, Users, Server
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, Line, ComposedChart
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DailyUsage({ pricing }) {
    const [fileName, setFileName] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [rowCount, setRowCount] = useState(0);

    // We only store the AGGREGATED SUMMARY, not the raw rows
    const [stats, setStats] = useState(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setProcessing(true);
        setError(null);
        setRowCount(0);

        // Mutable storage for aggregation during parsing
        const tempStats = {
            totalCost: 0,
            totalTokens: 0,
            uniqueExecutions: new Set(),
            dailyMap: {},
            deptMap: {},
            userMap: {},
            nodeMap: {}
        };

        let rowsProcessed = 0;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true, // Key: Runs in a separate thread
            step: (results) => {
                const row = results.data;
                rowsProcessed++;
                // Process row and immediately discard it
                processSingleRow(row, tempStats, pricing);

                // Update UI counter every 5000 rows to avoid re-render lag
                if (rowsProcessed % 5000 === 0) {
                    setRowCount(rowsProcessed);
                }
            },
            complete: () => {
                finalizeStats(tempStats);
                setRowCount(rowsProcessed);
                setProcessing(false);
            },
            error: (err) => {
                console.error(err);
                setError("Failed to parse CSV. Ensure it is a valid CSV file.");
                setProcessing(false);
            }
        });
    };

    const processSingleRow = (row, acc, pricing) => {
        // Safe Key Finding (CSV keys might have spaces/different casing)
        const findKey = (obj, target) => Object.keys(obj).find(k => k.toLowerCase().trim() === target.toLowerCase().trim());

        // Extract Data using flexible key matching
        const modelRaw = row[findKey(row, 'Model')] || 'unknown';
        const department = row[findKey(row, 'Department')] || 'Unassigned';
        const user = row[findKey(row, 'User')] || 'Unknown';
        const executionId = row[findKey(row, 'Unique')] || row[findKey(row, 'Execution ID')];
        const timeStr = row[findKey(row, 'Time')];
        const nodeName = row[findKey(row, 'Node Name')] || 'Unknown Node';

        const input = parseFloat(row[findKey(row, 'Input Tokens')] || 0);
        const output = parseFloat(row[findKey(row, 'Output Tokens')] || 0);
        const cached = parseFloat(row[findKey(row, 'Cached Tokens')] || row[findKey(row, 'Cache')] || 0);

        // --- COST CALCULATION ---
        let modelPriceKey = Object.keys(pricing.openai).find(k => modelRaw.includes(k));
        const rates = pricing.openai[modelPriceKey] || { input: 0, output: 0, cached: 0 };

        const freshInput = Math.max(0, input - cached);
        const cost =
            ((freshInput / 1e6) * rates.input) +
            ((cached / 1e6) * (rates.cached || rates.input)) +
            ((output / 1e6) * rates.output);

        // --- AGGREGATION ---

        // 1. Global
        acc.totalCost += cost;
        acc.totalTokens += (input + output);
        if (executionId) acc.uniqueExecutions.add(executionId);

        // 2. Daily
        const date = timeStr ? new Date(timeStr).toISOString().split('T')[0] : 'Unknown';
        if (!acc.dailyMap[date]) acc.dailyMap[date] = { cost: 0, tokens: 0, executionIds: new Set() };
        acc.dailyMap[date].cost += cost;
        acc.dailyMap[date].tokens += (input + output);
        if (executionId) acc.dailyMap[date].executionIds.add(executionId);

        // 3. User
        if (!acc.userMap[user]) acc.userMap[user] = { cost: 0, tokens: 0, department, executionIds: new Set() };
        acc.userMap[user].cost += cost;
        acc.userMap[user].tokens += (input + output);
        if (executionId) acc.userMap[user].executionIds.add(executionId);

        // 4. Department
        if (!acc.deptMap[department]) acc.deptMap[department] = { cost: 0, tokens: 0, executionIds: new Set() };
        acc.deptMap[department].cost += cost;
        acc.deptMap[department].tokens += (input + output);
        if (executionId) acc.deptMap[department].executionIds.add(executionId);

        // 5. Node
        // Simplify node name to group variations
        const cleanNodeName = nodeName.trim();
        const nodeKey = `${cleanNodeName} (${modelRaw})`;
        if (!acc.nodeMap[nodeKey]) acc.nodeMap[nodeKey] = { name: cleanNodeName, model: modelRaw, cost: 0, rowCount: 0 };
        acc.nodeMap[nodeKey].cost += cost;
        acc.nodeMap[nodeKey].rowCount += 1;
    };

    const finalizeStats = (tempStats) => {
        // --- Transform Maps to Sorted Arrays for Charts ---

        // 1. Daily Trend
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

        // 2. Departments
        const departmentData = Object.entries(tempStats.deptMap)
            .map(([name, data]) => ({
                name,
                cost: data.cost,
                tokens: data.tokens,
                uniqueExecutions: data.executionIds.size
            }))
            .sort((a, b) => b.cost - a.cost);

        // 3. Users (Limit to Top 100 to save memory)
        const userData = Object.entries(tempStats.userMap)
            .map(([name, data]) => ({
                name,
                cost: data.cost,
                tokens: data.tokens,
                department: data.department,
                uniqueExecutions: data.executionIds.size
            }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 100);

        // 4. Nodes (Limit to Top 50)
        const nodeData = Object.values(tempStats.nodeMap)
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 50);

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

    const handleReset = () => {
        setStats(null);
        setFileName(null);
        setRowCount(0);
        setError(null);
    };

    return (
        <div className="space-y-6 animate-slide-in pb-12">

            {/* 1. Upload Area - Show if NO stats and NOT processing */}
            {!stats && !processing && (
                <div className="bg-white p-12 rounded-xl shadow-sm border-2 border-dashed border-gray-300 text-center hover:border-indigo-400 transition-colors">
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="fileUpload" />
                    <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center justify-center gap-4">
                        <div className="bg-indigo-50 p-6 rounded-full">
                            <UploadCloud size={48} className="text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Upload Large Usage Report</h3>
                            <p className="text-gray-500 mt-2">
                                Optimized for large datasets (1M+ rows).<br />
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
                    <h3 className="text-lg font-bold text-gray-800">Analyzing Data Stream...</h3>
                    <p className="text-gray-500 mb-2">{fileName}</p>
                    <div className="text-2xl font-mono font-bold text-indigo-600">
                        {rowCount.toLocaleString()} rows processed
                    </div>
                </div>
            )}

            {/* 3. Dashboard - Show if stats EXIST */}
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
                                <p className="text-xs text-gray-500">{rowCount.toLocaleString()} total rows analyzed</p>
                            </div>
                        </div>
                        <button
                            onClick={handleReset}
                            className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <X size={16} /> Reset Data
                        </button>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-card p-6 rounded-lg border-l-4 border-indigo-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Total Estimated Cost</p>
                            <div className="text-3xl font-bold text-gray-900">${stats.totalCost.toFixed(2)}</div>
                        </div>
                        <div className="glass-card p-6 rounded-lg border-l-4 border-emerald-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Total Token Volume</p>
                            <div className="text-3xl font-bold text-gray-900">{(stats.totalTokens / 1e6).toFixed(2)}M</div>
                        </div>
                        <div className="glass-card p-6 rounded-lg border-l-4 border-blue-500">
                            <p className="text-sm font-medium text-gray-500 mb-1">Unique Executions</p>
                            <div className="text-3xl font-bold text-gray-900">{stats.totalUniqueExecutions.toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Main Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Daily Trend */}
                        <div className="lg:col-span-2 glass-card p-6 rounded-lg">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <TrendingUp size={18} className="text-gray-400" /> Daily Cost Trend
                            </h3>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={stats.dailyData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis yAxisId="left" orientation="left" tickFormatter={(v) => `$${v}`} />
                                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} />
                                        <Tooltip
                                            formatter={(value, name) => [
                                                name === 'cumulativeCost' || name === 'cost' ? `$${value.toFixed(2)}` : value,
                                                name === 'cumulativeCost' ? 'Cumulative' : 'Daily Cost'
                                            ]}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="cost" name="Daily Cost" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="cumulativeCost" name="Cumulative" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Department Pie */}
                        <div className="glass-card p-6 rounded-lg">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <Layers size={18} className="text-gray-400" /> Cost by Dept
                            </h3>
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

                    {/* Top Users Table */}
                    <div className="glass-card p-6 rounded-lg">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-gray-400" /> Top 100 Users by Cost
                        </h3>
                        <div className="overflow-auto max-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3">User</th>
                                        <th className="px-4 py-3">Department</th>
                                        <th className="px-4 py-3 text-right">Execs</th>
                                        <th className="px-4 py-3 text-right">Tokens</th>
                                        <th className="px-4 py-3 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.userData.map((u, i) => (
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
                    </div>

                    {/* Top Nodes Table */}
                    <div className="glass-card p-6 rounded-lg">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Server size={18} className="text-gray-400" /> Top AI Nodes by Cost
                        </h3>
                        <div className="overflow-auto max-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3">Node Name</th>
                                        <th className="px-4 py-3">Model</th>
                                        <th className="px-4 py-3 text-right">Ops Count</th>
                                        <th className="px-4 py-3 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.nodeData.map((n, i) => (
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
                    </div>
                </>
            )}
        </div>
    );
}