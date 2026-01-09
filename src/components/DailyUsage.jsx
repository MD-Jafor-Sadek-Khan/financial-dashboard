import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    UploadCloud, FileSpreadsheet, AlertCircle, TrendingUp,
    Users, DollarSign, Activity, Layers, Server, BarChart2, Calendar, Filter, X
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, Line, ComposedChart
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DailyUsage({ pricing }) {
    const [data, setData] = useState([]);
    const [fileName, setFileName] = useState(null);
    const [error, setError] = useState(null);

    // --- Date Filtering State ---
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // --- 1. File Handling ---
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setError(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const wsname = workbook.SheetNames[0];
                const ws = workbook.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                if (jsonData.length === 0) {
                    setError("The sheet appears to be empty.");
                    return;
                }

                processData(jsonData);
            } catch (err) {
                console.error(err);
                setError("Failed to parse file. Ensure it is a valid .xlsx or .csv.");
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleReset = () => {
        setData([]);
        setFileName(null);
        setError(null);
        setDateRange({ start: '', end: '' });
    };

    // --- 2. Data Processing ---
    const processData = (rawData) => {
        const findKey = (obj, target) => Object.keys(obj).find(k => k.toLowerCase().trim() === target.toLowerCase().trim());

        const enriched = rawData.map((row, index) => {
            const department = row[findKey(row, 'Department')] || 'Unassigned';
            const user = row[findKey(row, 'User')] || 'Unknown';
            const executionId = row[findKey(row, 'Unique')] || row[findKey(row, 'Execution ID')] || `unknown-${index}`;
            const timeStr = row[findKey(row, 'Time')];
            const nodeName = row[findKey(row, 'Node Name')] || 'Unknown Node';
            const loopNum = row[findKey(row, 'Loop #')] || 1;
            const modelRaw = row[findKey(row, 'Model')] || 'unknown';

            const input = parseFloat(row[findKey(row, 'Input Tokens')] || 0);
            const output = parseFloat(row[findKey(row, 'Output Tokens')] || 0);
            const cached = parseFloat(row[findKey(row, 'Cached Tokens')] || row[findKey(row, 'Cache')] || 0);

            let modelPriceKey = Object.keys(pricing.openai).find(k => modelRaw.includes(k));
            const rates = pricing.openai[modelPriceKey] || { input: 0, output: 0, cached: 0 };

            const freshInput = Math.max(0, input - cached);
            const inputCost = (freshInput / 1e6) * rates.input;
            const cacheCost = (cached / 1e6) * (rates.cached || rates.input);
            const outputCost = (output / 1e6) * rates.output;
            const totalCost = inputCost + cacheCost + outputCost;

            return {
                id: index,
                department,
                user,
                executionId: String(executionId),
                nodeName,
                loopNum,
                originalDate: timeStr,
                date: timeStr ? new Date(timeStr).toISOString().split('T')[0] : 'Unknown', // YYYY-MM-DD
                model: modelRaw,
                input,
                output,
                cached,
                totalTokens: input + output,
                cost: totalCost
            };
        });

        setData(enriched);
    };

    // --- 3. Date Filter Helpers ---
    const applyPreset = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setDateRange({
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        });
    };

    const applyThisMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setDateRange({
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        });
    };

    const clearFilter = () => setDateRange({ start: '', end: '' });

    // --- 4. Aggregations ---
    const stats = useMemo(() => {
        if (data.length === 0) return null;

        // Filter Data First
        let filteredData = data;
        if (dateRange.start) {
            filteredData = filteredData.filter(d => d.date >= dateRange.start);
        }
        if (dateRange.end) {
            filteredData = filteredData.filter(d => d.date <= dateRange.end);
        }

        if (filteredData.length === 0) return { empty: true };

        // A. Global Totals
        const totalCost = filteredData.reduce((acc, r) => acc + r.cost, 0);
        const totalTokens = filteredData.reduce((acc, r) => acc + r.totalTokens, 0);
        const allExecutionIds = new Set(filteredData.map(r => r.executionId));
        const totalUniqueExecutions = allExecutionIds.size;

        // B. Daily Aggregation
        const dailyMap = {};
        filteredData.forEach(r => {
            if (!dailyMap[r.date]) {
                dailyMap[r.date] = { date: r.date, cost: 0, tokens: 0, executionIds: new Set() };
            }
            dailyMap[r.date].cost += r.cost;
            dailyMap[r.date].tokens += r.totalTokens;
            dailyMap[r.date].executionIds.add(r.executionId);
        });
        const dailyData = Object.values(dailyMap).map(d => ({
            ...d,
            uniqueExecutions: d.executionIds.size
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        // C. Department-wise
        const deptMap = {};
        filteredData.forEach(r => {
            if (!deptMap[r.department]) {
                deptMap[r.department] = { name: r.department, cost: 0, tokens: 0, executionIds: new Set() };
            }
            deptMap[r.department].cost += r.cost;
            deptMap[r.department].tokens += r.totalTokens;
            deptMap[r.department].executionIds.add(r.executionId);
        });
        const departmentData = Object.values(deptMap).map(d => ({
            ...d, uniqueExecutions: d.executionIds.size
        })).sort((a, b) => b.cost - a.cost);

        // D. User-wise
        const userMap = {};
        filteredData.forEach(r => {
            if (!userMap[r.user]) {
                userMap[r.user] = { name: r.user, department: r.department, cost: 0, tokens: 0, executionIds: new Set() };
            }
            userMap[r.user].cost += r.cost;
            userMap[r.user].tokens += r.totalTokens;
            userMap[r.user].executionIds.add(r.executionId);
        });
        const userData = Object.values(userMap).map(u => ({
            ...u, uniqueExecutions: u.executionIds.size
        })).sort((a, b) => b.cost - a.cost);

        // E. Node-wise
        const nodeMap = {};
        filteredData.forEach(r => {
            const key = `${r.nodeName} (${r.model})`;
            if (!nodeMap[key]) {
                nodeMap[key] = { name: r.nodeName, model: r.model, cost: 0, tokens: 0, rowCount: 0 };
            }
            nodeMap[key].cost += r.cost;
            nodeMap[key].tokens += r.totalTokens;
            nodeMap[key].rowCount += 1;
        });
        const nodeData = Object.values(nodeMap).sort((a, b) => b.cost - a.cost);

        return {
            totalUniqueExecutions, totalCost, totalTokens,
            dailyData, departmentData, userData, nodeData, empty: false
        };
    }, [data, dateRange]);

    return (
        <div className="space-y-6 animate-slide-in pb-12">

            {/* 1. Upload Area - Show ONLY if no data */}
            {data.length === 0 && (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-dashed border-gray-300 text-center transition-all">
                    <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" id="fileUpload" />
                    <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center justify-center gap-4 hover:bg-gray-50 transition-colors p-6 rounded-lg">
                        <div className="bg-indigo-50 p-4 rounded-full text-indigo-600">
                            {fileName ? <FileSpreadsheet size={32} /> : <UploadCloud size={32} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">
                                {fileName ? `Loaded: ${fileName}` : "Upload Actual Usage Report"}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Supports .xlsx with columns: Department, User, Unique, Node Name, Loop #, etc.
                            </p>
                        </div>
                    </label>
                    {error && <div className="mt-4 p-2 bg-red-50 text-red-600 text-sm rounded border border-red-100">{error}</div>}
                </div>
            )}

            {/* 2. Loaded State Header (File Pill) - Show ONLY if data exists */}
            {data.length > 0 && (
                <div className="flex justify-end">
                    <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200 text-sm animate-slide-in">
                        <FileSpreadsheet size={16} className="text-emerald-600" />
                        <span className="font-medium text-gray-700 max-w-[200px] truncate" title={fileName}>{fileName}</span>
                        <button
                            onClick={handleReset}
                            className="ml-2 p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove file"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {stats && !stats.empty && (
                <>
                    {/* --- DATE FILTER CONTROLS --- */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Filter size={20} className="text-gray-500" />
                            <span className="text-sm font-bold text-gray-700">Filter Date Range:</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => applyPreset(7)} className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors">Last 7 Days</button>
                            <button onClick={() => applyPreset(30)} className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors">Last 30 Days</button>
                            <button onClick={applyThisMonth} className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors">This Month</button>
                            {(dateRange.start || dateRange.end) && (
                                <button onClick={clearFilter} className="px-3 py-1 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 rounded-full flex items-center gap-1 transition-colors">
                                    <X size={12} /> Clear Filter
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="border rounded px-2 py-1 text-sm text-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                            <span className="text-gray-400 text-sm">to</span>
                            <input
                                type="date"
                                className="border rounded px-2 py-1 text-sm text-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 1. Global KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-indigo-500">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Actual Cost</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">${stats.totalCost.toFixed(2)}</h3>
                                </div>
                                <div className="p-2 bg-indigo-50 rounded text-indigo-600"><DollarSign size={20} /></div>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Unique Executions</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalUniqueExecutions.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-blue-50 rounded text-blue-600"><Activity size={20} /></div>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-emerald-500">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-gray-500">Total Tokens</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{(stats.totalTokens / 1e6).toFixed(3)}M</h3>
                                </div>
                                <div className="p-2 bg-emerald-50 rounded text-emerald-600"><TrendingUp size={20} /></div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Daily Breakdown Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <Calendar size={20} className="text-gray-400" /> Daily Cost & Volume
                            </h3>
                            {/* Daily Chart */}
                            <div className="h-64 w-full mb-6">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={stats.dailyData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis yAxisId="left" orientation="left" stroke="#4f46e5" label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft' }} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                                        <Tooltip
                                            formatter={(value, name) => [
                                                name === 'cost' ? `$${value.toFixed(2)}` : value.toLocaleString(),
                                                name === 'cost' ? 'Cost' : 'Unique Execs'
                                            ]}
                                        />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="cost" fill="#4f46e5" name="Cost ($)" barSize={20} radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="uniqueExecutions" stroke="#10b981" name="Unique Execs" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Daily Table */}
                        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Daily Totals</h3>
                            <div className="overflow-y-auto flex-1 max-h-[300px]">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Date</th>
                                            <th className="px-4 py-2 text-right">Execs</th>
                                            <th className="px-4 py-2 text-right">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {[...stats.dailyData].reverse().map((d, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 text-gray-600">{d.date}</td>
                                                <td className="px-4 py-2 text-right font-mono text-blue-600">{d.uniqueExecutions}</td>
                                                <td className="px-4 py-2 text-right font-bold text-indigo-600">${d.cost.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 3. Department Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <Layers size={20} className="text-gray-400" /> Department Breakdown
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3">Department</th>
                                            <th className="px-4 py-3 text-right">Unique Execs</th>
                                            <th className="px-4 py-3 text-right">Tokens</th>
                                            <th className="px-4 py-3 text-right">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {stats.departmentData.map((d, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-800">{d.name}</td>
                                                <td className="px-4 py-3 text-right font-mono text-blue-600">{d.uniqueExecutions}</td>
                                                <td className="px-4 py-3 text-right text-gray-500">{(d.tokens).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-bold text-indigo-600">${d.cost.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-200">
                                            <td className="px-4 py-3">TOTAL</td>
                                            <td className="px-4 py-3 text-right">{stats.totalUniqueExecutions}</td>
                                            <td className="px-4 py-3 text-right">{stats.totalTokens.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">${stats.totalCost.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col items-center justify-center">
                            <h4 className="text-sm font-bold text-gray-500 mb-4 w-full text-left">Cost by Department</h4>
                            <div className="h-64 w-full">
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
                                        <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* 4. User Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Users size={20} className="text-gray-400" /> User Breakdown
                            </h3>
                            <div className="overflow-x-auto max-h-[400px]">
                                <table className="w-full text-sm text-left relative">
                                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3">User</th>
                                            <th className="px-4 py-3">Department</th>
                                            <th className="px-4 py-3 text-right">Unique Execs</th>
                                            <th className="px-4 py-3 text-right">Total Tokens</th>
                                            <th className="px-4 py-3 text-right">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {stats.userData.map((u, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                                                <td className="px-4 py-3 text-gray-500 text-xs">
                                                    <span className="bg-gray-100 px-2 py-1 rounded">{u.department}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-blue-600">{u.uniqueExecutions}</td>
                                                <td className="px-4 py-3 text-right text-gray-500">{u.tokens.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-bold text-indigo-600">${u.cost.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-200">
                                            <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                                            <td className="px-4 py-3 text-right">{stats.totalUniqueExecutions}</td>
                                            <td className="px-4 py-3 text-right">{stats.totalTokens.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">${stats.totalCost.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm">
                            <h4 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2">
                                <BarChart2 size={16} /> Top Users by Cost
                            </h4>
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.userData.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20, bottom: 0, top: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                                        <Tooltip
                                            formatter={(value) => `$${value.toFixed(2)}`}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="cost" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* 5. Node Breakdown */}
                    <div className="bg-white p-6 rounded-lg shadow-sm">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Server size={20} className="text-gray-400" /> AI Node Breakdown
                        </h3>
                        <div className="overflow-x-auto max-h-[400px]">
                            <table className="w-full text-sm text-left relative">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3">Node Name</th>
                                        <th className="px-4 py-3">Model</th>
                                        <th className="px-4 py-3 text-right">Total OPS</th>
                                        <th className="px-4 py-3 text-right">Tokens Consumed</th>
                                        <th className="px-4 py-3 text-right">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {stats.nodeData.map((n, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-800">{n.name}</td>
                                            <td className="px-4 py-3 text-xs text-blue-600">{n.model}</td>
                                            <td className="px-4 py-3 text-right text-gray-400 text-xs">{n.rowCount}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{n.tokens.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-indigo-600">${n.cost.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-200">
                                        <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                                        <td className="px-4 py-3 text-right">-</td>
                                        <td className="px-4 py-3 text-right">{stats.totalTokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right">${stats.totalCost.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </>
            )}

            {stats && stats.empty && (
                <div className="text-center p-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-500 font-medium">No data found for the selected date range.</p>
                    <button onClick={clearFilter} className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm font-bold">Clear Filters</button>
                </div>
            )}
        </div>
    );
}