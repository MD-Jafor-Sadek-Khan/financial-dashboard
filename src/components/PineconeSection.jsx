import React from 'react';
import { Database, HardDrive, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

export default function PineconeSection({ data, setData, pricing, calculatedCost }) {
  const { plan, storageGB, readUnits, writeUnits } = data;
  const rates = pricing.pinecone;
  const planDetails = rates.plans && rates.plans[plan] ? rates.plans[plan] : { min: 0 };
  
  // Just for display logic
  const rawUsageCost = (storageGB * rates.storage) + (readUnits / 1e6 * rates.read) + (writeUnits / 1e6 * rates.write);

  // Styles matching Daily Analytics inputs
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg bg-white/50 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all pl-9";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5";
  const iconClass = "absolute left-3 top-2.5 text-gray-400";

  return (
    <div className="glass-card p-6 rounded-xl mt-6 animate-slide-in" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Database size={20} />
          </div>
          <h2 className="text-lg font-bold text-gray-800">3. Memory store (Pinecone)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="md:col-span-1">
            <label className={labelClass}>Plan</label>
            <select 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white/50 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                value={plan} 
                onChange={(e) => setData({...data, plan: e.target.value})}
            >
                {Object.entries(rates.plans).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                ))}
            </select>
        </div>
        
        <div>
            <label className={labelClass}>Storage (GB)</label>
            <div className="relative">
                <HardDrive size={16} className={iconClass} />
                <input 
                    type="number" step="0.1" min="0"
                    className={inputClass} 
                    value={storageGB} 
                    onChange={(e) => setData({...data, storageGB: parseFloat(e.target.value) || 0})}
                />
            </div>
        </div>

        <div>
            <label className={labelClass}>Read activity (units)</label>
            <div className="relative">
                <ArrowUpCircle size={16} className={iconClass} />
                <input 
                    type="number" min="0"
                    className={inputClass} 
                    value={readUnits} 
                    onChange={(e) => setData({...data, readUnits: parseFloat(e.target.value) || 0})}
                />
            </div>
        </div>

        <div>
            <label className={labelClass}>Write activity (units)</label>
            <div className="relative">
                <ArrowDownCircle size={16} className={iconClass} />
                <input 
                    type="number" min="0"
                    className={inputClass} 
                    value={writeUnits} 
                    onChange={(e) => setData({...data, writeUnits: parseFloat(e.target.value) || 0})}
                />
            </div>
        </div>
      </div>

      <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl flex justify-between items-center">
        <div>
           <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Billing summary</div>
           <div className="text-sm text-gray-600">
              Usage charges: <span className="font-mono">${rawUsageCost.toFixed(4)}</span>
              <span className="mx-2 text-gray-300">|</span>
              Plan minimum: <span className="font-mono">${planDetails.min.toFixed(2)}</span>
           </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Monthly cost</div>
          <div className="text-2xl font-extrabold text-gray-900">${calculatedCost.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
