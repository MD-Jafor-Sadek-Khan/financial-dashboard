import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, RefreshCw, PieChart as PieIcon, Download, Calculator, BarChart2, Database } from 'lucide-react';
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
import DailyUsage from './components/DailyUsage';
import DataGenerator from './components/DataGenerator';

// Chart Colors matched to design system
const COLORS = ['#f97316', '#2563eb', '#4f46e5'];

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('analytics');
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

  // 3. Prepare Chart Data
  const chartData = [
    { name: 'Automation platform (N8n)', value: n8nCost },
    { name: 'AI model usage (OpenAI)', value: openAICost },
    { name: 'Memory store (Pinecone)', value: pineconeCost },
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
      ['Automation platform (N8n)', n8nData.plan, `${n8nData.duration} billing`, n8nCost.toFixed(2)],
      ['Memory store (Pinecone)', pineconeData.plan, `${pineconeData.storageGB}GB / ${pineconeData.readUnits} read units`, pineconeCost.toFixed(2)],
      ...aiNodes.map(node => [
        'AI model usage (OpenAI)',
        node.name,
        `${node.model} (${node.executionsPerDay} runs/day)`,
        // Re-calc row cost logic for CSV consistency
        // Using simplified logic here for the export row; detailed logic is in the component/utils
         (( (pricing.openai[node.model]?.input || 0) * (node.inputTokens / 1e6) + (pricing.openai[node.model]?.output || 0) * (node.outputTokens / 1e6)) * node.executionsPerDay * daysInMonth).toFixed(2)
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

  // 5. Save Function
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
      }
    } catch (e) {
      console.error("Error loading:", e);
      setStatus("Offline");
      showToast("Could not connect to database", "error");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadData();
    };
    init();
  }, [loadData]);

  // --- RENDER CONTENT BASED ON TAB ---
  const renderContent = () => {
    if (activeTab === 'analytics') {
      return <DailyUsage pricing={pricing} />;
    }
    if (activeTab === 'calculator') {
      return (
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
            <div className="glass-card p-6 rounded-xl border border-gray-200 sticky top-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <PieIcon size={20} className="text-gray-400" /> Monthly cost breakdown
                </h2>
                <button onClick={handleExport} className="p-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors" title="Download cost report">
                  <Download size={18} />
                </button>
              </div>

              {/* The Chart */}
              <div className="h-64 w-full mb-6 relative">
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
                    <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Grand Total Card */}
              <div className="pt-6 border-t border-dashed border-gray-200 text-center">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Estimated monthly total
                </div>
                <div className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500 mt-2 pb-1">
                  {formatCurrency(grandTotal)}
                </div>
                <div className="text-xs text-gray-400 mt-3 font-medium bg-gray-50 inline-block px-3 py-1 rounded-full border border-gray-100">
                  Based on {getDaysInCurrentMonth()} calendar days
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    // New Generator Tab
    if (activeTab === 'generator') {
      return <DataGenerator pricing={pricing} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">AI Spend & Operations Overview</h1>
            <p className="text-slate-500 mt-1">A clear view of spend, usage, and trends</p>
          </div>
          <div className="flex gap-3">
            <div className="glass-card px-4 py-2 rounded-lg shadow-sm text-sm font-medium flex items-center min-w-[140px] justify-center border border-gray-200">
              <span className={`w-2 h-2 rounded-full mr-2 ${status.includes("Fail") || status.includes("Error") || status.includes("Offline") ? "bg-red-500" : "bg-green-500"}`}></span>
              {status}
            </div>

            <button onClick={loadData} className="p-2 glass-card rounded-lg shadow-sm border border-gray-200 hover:bg-white text-gray-700 transition-all" title="Refresh data">
              <RefreshCw size={20} />
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 glass-card rounded-lg shadow-sm border border-gray-200 hover:bg-white text-gray-700 transition-all">
              <Settings size={20} />
            </button>
            <button onClick={() => handleSave(false)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-md hover:bg-slate-800 transition-all active:scale-95">
              <Save size={18} /> Save changes
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="mb-8 flex space-x-1 glass-card p-1.5 rounded-xl shadow-sm w-fit overflow-x-auto border border-gray-200">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <BarChart2 size={18} /> Daily spend
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'calculator' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <Calculator size={18} /> Budget planner
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'generator' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <Database size={18} /> Sample data
          </button>
        </div>

        {/* MAIN CONTENT */}
        {renderContent()}

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
