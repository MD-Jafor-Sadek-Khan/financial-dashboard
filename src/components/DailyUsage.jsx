import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, AlertCircle, TrendingUp, 
  Users, DollarSign, Activity, Calendar 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart
} from 'recharts';

export default function DailyUsage({ pricing }) {
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

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

  // --- 2. Data Processing ---
  const processData = (rawData) => {
    // Helper to find keys case-insensitively
    const findKey = (obj, target) => Object.keys(obj).find(k => k.toLowerCase().includes(target.toLowerCase()));

    const enriched = rawData.map((row, index) => {
        // Map Excel Columns based on your PDF 
        const user = row[findKey(row, 'User')] || 'Unknown';
        const timeStr = row[findKey(row, 'Time')];
        const modelRaw = row[findKey(row, 'Model')] || 'unknown';
        
        // Parse numeric tokens
        const input = parseFloat(row[findKey(row, 'Input Tokens')] || 0);
        const output = parseFloat(row[findKey(row, 'Output Tokens')] || 0);
        const cached = parseFloat(row[findKey(row, 'Cached Tokens')] || row[findKey(row, 'Cache')] || 0);

        // Find matching pricing model
        let modelPriceKey = Object.keys(pricing.openai).find(k => modelRaw.includes(k));
        const rates = pricing.openai[modelPriceKey] || { input: 0, output: 0, cached: 0 };

        // Calculate Cost: (Fresh Input * InputRate) + (Cached Input * CachedRate) + (Output * OutputRate)
        // Note: 'Input Tokens' in N8n usually includes the cached ones, so we subtract cached from input for the 'fresh' cost
        const freshInput = Math.max(0, input - cached);
        
        const inputCost = (freshInput / 1e6) * rates.input;
        const cacheCost = (cached / 1e6) * (rates.cached || rates.input); // Fallback to input price if no cached price
        const outputCost = (output / 1e6) * rates.output;
        
        const totalCost = inputCost + cacheCost + outputCost;

        return {
            id: index,
            user,
            originalDate: timeStr,
            date: timeStr ? new Date(timeStr).toISOString().split('T')[0] : 'Unknown',
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

  // --- 3. Aggregations ---
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const totalExecutions = data.length;
    const totalCost = data.reduce((acc, r) => acc + r.cost, 0);
    const totalTokens = data.reduce((acc, r) => acc + r.totalTokens, 0);

    // Group by Day
    const dailyMap = {};
    data.forEach(r => {
      if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, cost: 0, tokens: 0, executions: 0 };
      dailyMap[r.date].cost += r.cost;
      dailyMap[r.date].tokens += r.totalTokens;
      dailyMap[r.date].executions += 1;
    });
    const dailyData = Object.values(dailyMap).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group by User
    const userMap = {};
    data.forEach(r => {
      if (!userMap[r.user]) userMap[r.user] = { name: r.user, cost: 0, tokens: 0, executions: 0 };
      userMap[r.user].cost += r.cost;
      userMap[r.user].tokens += r.totalTokens;
      userMap[r.user].executions += 1;
    });
    const userData = Object.values(userMap).sort((a, b) => b.cost - a.cost);

    // Find Outliers (Top 5 most expensive single runs)
    const outliers = [...data].sort((a, b) => b.cost - a.cost).slice(0, 5);

    return { totalExecutions, totalCost, totalTokens, dailyData, userData, outliers };
  }, [data]);

  return (
    <div className="space-y-8 animate-slide-in">
      
      {/* Upload Area */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-dashed border-gray-300 text-center">
        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" id="fileUpload"/>
        <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center justify-center gap-4 hover:bg-gray-50 transition-colors p-6 rounded-lg">
          <div className="bg-indigo-50 p-4 rounded-full text-indigo-600">
            {fileName ? <FileSpreadsheet size={32} /> : <UploadCloud size={32} />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              {fileName ? `Loaded: ${fileName}` : "Upload Actual Usage Report"}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Supports .xlsx from N8n Workflow (Columns: User, Time, Model, Tokens)
            </p>
          </div>
        </label>
        {error && <div className="mt-4 p-2 bg-red-50 text-red-600 text-sm rounded border border-red-100">{error}</div>}
      </div>

      {stats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-indigo-500">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Actual Cost</p>
                  <h3 className="text-3xl font-bold text-gray-900 mt-1">${stats.totalCost.toFixed(2)}</h3>
                </div>
                <div className="p-2 bg-indigo-50 rounded text-indigo-600"><DollarSign size={20}/></div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Executions</p>
                  <h3 className="text-3xl font-bold text-gray-900 mt-1">{stats.totalExecutions.toLocaleString()}</h3>
                </div>
                <div className="p-2 bg-blue-50 rounded text-blue-600"><Activity size={20}/></div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-emerald-500">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Tokens</p>
                  <h3 className="text-3xl font-bold text-gray-900 mt-1">{(stats.totalTokens / 1e6).toFixed(3)}M</h3>
                </div>
                <div className="p-2 bg-emerald-50 rounded text-emerald-600"><TrendingUp size={20}/></div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Trend */}
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Calendar size={20} className="text-gray-400" /> Daily Cost & Volume
              </h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{fontSize: 12}} />
                    <YAxis yAxisId="left" orientation="left" stroke="#4f46e5" label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'cost' ? `$${value.toFixed(2)}` : value.toLocaleString(),
                        name === 'cost' ? 'Cost' : 'Tokens'
                      ]}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="cost" fill="#4f46e5" name="Cost ($)" barSize={20} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="tokens" stroke="#10b981" name="Tokens" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Breakdown Table */}
            <div className="bg-white p-6 rounded-lg shadow-sm overflow-hidden flex flex-col">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users size={20} className="text-gray-400" /> User Impact
              </h3>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-right">Runs</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.userData.map((u, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{u.name}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{u.executions}</td>
                        <td className="px-3 py-2 text-right font-bold text-indigo-600">${u.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Outliers Section */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-red-600 flex items-center gap-2">
              <AlertCircle size={20} /> High Cost Outliers (Top 5 Executions)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-red-50 text-red-800 uppercase text-xs">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Model</th>
                    <th className="p-3 text-right">Input</th>
                    <th className="p-3 text-right">Output</th>
                    <th className="p-3 text-right">Cached</th>
                    <th className="p-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.outliers.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-red-50/30">
                      <td className="p-3 text-gray-600 font-mono text-xs">{row.originalDate.split('T')[1]?.split('.')[0] || row.originalDate}</td>
                      <td className="p-3 font-medium">{row.user}</td>
                      <td className="p-3 text-blue-600 text-xs">{row.model}</td>
                      <td className="p-3 text-right">{row.input}</td>
                      <td className="p-3 text-right">{row.output}</td>
                      <td className="p-3 text-right text-green-600">{row.cached}</td>
                      <td className="p-3 text-right font-bold text-red-600">${row.cost.toFixed(4)}</td>
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