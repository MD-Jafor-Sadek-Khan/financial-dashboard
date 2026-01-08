import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, RefreshCw, PieChart as PieIcon, Download, Calculator, BarChart2 } from 'lucide-react';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from './firebase';
import { INITIAL_DATA } from './data/initialData';
import { calculateN8nCost, calculateOpenAICost, calculatePineconeCost, getDaysInCurrentMonth } from './utils/costUtils';
// Import Recharts
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

import N8nSection from './components/N8nSection';
import OpenAISection from './components/OpenAISection';
import PineconeSection from './components/PineconeSection';
import SettingsModal from './components/SettingsModal';
import Toast from './components/Toast';
import DailyUsage from './components/DailyUsage'; // <--- IMPORT NEW COMPONENT

// Chart Colors
const COLORS = ['#f97316', '#2563eb', '#4f46e5'];

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('calculator'); // 'calculator' | 'analytics'
  const [status, setStatus] = useState("Initializing...");
  const [toast, setToast] = useState(null);

  // 1. Initialize State with Seed Data
  const [n8nData, setN8nData] = useState(INITIAL_DATA.n8nData);
  const [aiNodes, setAiNodes] = useState(INITIAL_DATA.aiNodes);
  const [pineconeData, setPineconeData] = useState(INITIAL_DATA.pineconeData);
  const [pricing, setPricing] = useState(INITIAL_DATA.pricing);

  // 2. Real-time Calculations (Calculator Mode)
  const n8nCost = calculateN8nCost(n8nData, pricing);
  const openAICost = calculateOpenAICost(aiNodes, pricing);
  const pineconeCost = calculatePineconeCost(pineconeData, pricing);
  const grandTotal = n8nCost + openAICost + pineconeCost;

  // 3. Prepare Chart Data (Must be defined here!)
  const chartData = [
    { name: 'N8n Workflow', value: n8nCost },
    { name: 'OpenAI Intelligence', value: openAICost },
    { name: 'Pinecone Memory', value: pineconeCost },
  ].filter(item => item.value > 0);

  // Helper for formatting currency
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // --- ACTIONS ---

  // 4. Export CSV Function
  const handleExport = () => {
    const daysInMonth = getDaysInCurrentMonth();

    const rows = [
      ['Category', 'Item', 'Detail', 'Monthly Cost'],
      ['N8n', n8nData.plan, `${n8nData.duration} billing`, n8nCost.toFixed(2)],
      ['Pinecone', pineconeData.plan, `${pineconeData.storageGB}GB / ${pineconeData.readUnits} RUs`, pineconeCost.toFixed(2)],
      ...aiNodes.map(node => [
        'OpenAI',
        node.name,
        `${node.model} (${node.executionsPerDay} runs/day)`,
        // Re-calc row cost for CSV
        ((pricing.openai[node.model].input * (node.inputTokens / 1e6) + pricing.openai[node.model].output * (node.outputTokens / 1e6)) * node.executionsPerDay * daysInMonth).toFixed(2)
      ]),
      ['TOTAL', '', `Based on ${daysInMonth} days`, grandTotal.toFixed(2)]
    ];

    const csvContent = "data:text/csv;charset=utf-8,"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `financial_model_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Report downloaded successfully!", "success");
  };

  // 5. Save Function (Defined BEFORE loadData uses it)
  const handleSave = useCallback(async (silent = false) => {
    if (!silent) setStatus("Saving...");
    try {
      await setDoc(doc(db, "dashboards", "main_config"), {
        n8nData, aiNodes, pineconeData, pricing, lastUpdated: new Date()
      });
      setStatus("Ready");
      if (!silent) showToast("Session saved successfully!", "success");
    } catch (e) {
      console.error(e);
      setStatus("Error");
      showToast("Failed to save data. Check console.", "error");
    }
  }, [n8nData, aiNodes, pineconeData, pricing]);

  // 6. Load Function
  const loadData = useCallback(async () => {
    // Note: Removed initial setStatus("Fetching") here to prevent immediate re-render loop
    try {
      const docRef = doc(db, "dashboards", "main_config");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.n8nData) setN8nData(data.n8nData);
        if (data.aiNodes) setAiNodes(data.aiNodes);
        if (data.pineconeData) setPineconeData(data.pineconeData);
        if (data.pricing) setPricing(data.pricing);
        setStatus("Synced");
      } else {
        setStatus("New DB");
        // We handle the initial save manually or let user do it to avoid loop
      }
    } catch (e) {
      console.error("Error loading:", e);
      setStatus("Offline");
      showToast("Could not connect to database", "error");
    }
  }, []);

  // FIX: Wrap the call in an internal async function.
  // This satisfies the linter ensuring we aren't synchronously calling setState inside the effect body.
  useEffect(() => {
    const init = async () => {
      await loadData();
    };
    init();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial & Operational Impact Dashboard</h1>
            <p className="text-slate-500">Real-time cost modeling & usage analytics</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white px-4 py-2 rounded shadow text-sm font-medium flex items-center min-w-[140px] justify-center">
              <span className={`w-2 h-2 rounded-full mr-2 ${status.includes("Fail") || status.includes("Error") || status.includes("Offline") ? "bg-red-500" : "bg-green-500"}`}></span>
              {status}
            </div>
            
            <button onClick={loadData} className="p-2 bg-white rounded shadow hover:bg-gray-50 text-gray-700" title="Refresh from DB">
              <RefreshCw size={20} />
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 bg-white rounded shadow hover:bg-gray-50 text-gray-700">
              <Settings size={20} />
            </button>
            <button onClick={() => handleSave(false)} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded shadow hover:bg-gray-800 transition-colors">
              <Save size={18} /> Save Session
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="mb-8 flex space-x-1 bg-white p-1 rounded-lg shadow-sm w-fit">
            <button 
                onClick={() => setActiveTab('calculator')}
                className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'calculator' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-900'}`}
            >
                <Calculator size={18} /> Forecast Calculator
            </button>
            <button 
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-900'}`}
            >
                <BarChart2 size={18} /> Daily Usage Analytics
            </button>
        </div>

        {/* --- MAIN CONTENT SWITCHER --- */}
        {activeTab === 'calculator' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-slide-in">
                {/* Left Column: Inputs */}
                <div className="lg:col-span-2 space-y-6">
                    <N8nSection
                    data={n8nData} setData={setN8nData}
                    pricing={pricing} calculatedCost={n8nCost}
                    />
                    <OpenAISection
                    nodes={aiNodes} setNodes={setAiNodes}
                    pricing={pricing} calculatedCost={openAICost}
                    />
                    <PineconeSection
                    data={pineconeData} setData={setPineconeData}
                    pricing={pricing} calculatedCost={pineconeCost}
                    />
                </div>

                {/* Right Column: Visualization Sticky Panel */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 sticky top-8">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <PieIcon size={20} className="text-slate-500" /> Cost Breakdown
                        </h2>
                        {/* EXPORT BUTTON MOVED HERE */}
                        <button onClick={handleExport} className="p-1.5 bg-gray-50 rounded hover:bg-gray-100 text-gray-600" title="Export Forecast CSV">
                            <Download size={16} />
                        </button>
                    </div>

                    {/* The Chart */}
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                            data={chartData}
                            cx="50%" cy="50%"
                            innerRadius={60} outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Grand Total Card */}
                    <div className="mt-6 pt-6 border-t border-dashed border-gray-200 text-center">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wide">
                        Total Monthly OpEx
                        </div>
                        <div className="text-4xl font-extrabold text-slate-900 mt-2">
                        {formatCurrency(grandTotal)}
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                        *Calculated for {getDaysInCurrentMonth()} days
                        </div>
                    </div>
                    </div>
                </div>
            </div>
        ) : (
            // --- NEW ANALYTICS PAGE ---
            <DailyUsage pricing={pricing} />
        )}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          pricing={pricing} setPricing={setPricing}
        />

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        <div className="h-24"></div>
      </div>
    </div>
  );
}

export default App;