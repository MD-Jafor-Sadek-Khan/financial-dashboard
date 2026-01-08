import React from 'react';

export default function PineconeSection({ data, setData, pricing, calculatedCost }) {
  const { plan, storageGB, readUnits, writeUnits } = data;
  const rates = pricing.pinecone;
  const planMin = rates.plans[plan].min;
  
  // Just for display logic
  const rawUsageCost = (storageGB * rates.storage) + (readUnits / 1e6 * rates.read) + (writeUnits / 1e6 * rates.write);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">3. Pinecone Memory (Vector DB)</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan Tier</label>
            <select className="w-full p-2 border rounded" value={plan} onChange={(e) => setData({...data, plan: e.target.value})}>
                {Object.entries(rates.plans).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                ))}
            </select>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage (GB)</label>
            <input type="number" step="0.1" className="w-full p-2 border rounded" value={storageGB} onChange={(e) => setData({...data, storageGB: parseFloat(e.target.value) || 0})}/>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Read Units (RUs)</label>
            <input type="number" className="w-full p-2 border rounded" value={readUnits} onChange={(e) => setData({...data, readUnits: parseFloat(e.target.value) || 0})}/>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Write Units (WUs)</label>
            <input type="number" className="w-full p-2 border rounded" value={writeUnits} onChange={(e) => setData({...data, writeUnits: parseFloat(e.target.value) || 0})}/>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-md flex justify-between items-center">
        <div className="text-sm text-gray-500">
            Raw Usage: ${rawUsageCost.toFixed(4)} <br/>
            Minimum Floor: ${planMin.toFixed(2)}
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total Database Cost</div>
          <div className="text-2xl font-bold text-indigo-600">${calculatedCost.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}