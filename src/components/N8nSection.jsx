import React from 'react';

export default function N8nSection({ data, setData, pricing, calculatedCost }) {
    const { plan, users, executionsPerUser, duration } = data;
    const currentPlan = pricing.n8n[plan];
    const totalExecutions = users * executionsPerUser;
    const isOverLimit = totalExecutions > currentPlan.limit;

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">1. N8n Workflow Execution</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Plan</label>
                    <select
                        className="w-full p-2 border rounded"
                        value={plan}
                        onChange={(e) => setData({ ...data, plan: e.target.value })}
                    >
                        {Object.entries(pricing.n8n).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Duration</label>
                    <select
                        className="w-full p-2 border rounded"
                        value={duration}
                        onChange={(e) => setData({ ...data, duration: e.target.value })}
                    >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Users</label>
                    <input
                        type="number" className="w-full p-2 border rounded"
                        value={users}
                        onChange={(e) => setData({ ...data, users: parseInt(e.target.value) || 0 })}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Executions per User</label>
                    <input
                        type="number" className="w-full p-2 border rounded"
                        value={executionsPerUser}
                        onChange={(e) => setData({ ...data, executionsPerUser: parseInt(e.target.value) || 0 })}
                    />
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-md flex justify-between items-center">
                <div>
                    <div className="text-sm text-gray-500">Total Executions Required</div>
                    <div className={`text-xl font-bold ${isOverLimit ? 'text-red-600' : 'text-gray-900'}`}>
                        {totalExecutions.toLocaleString()} / {currentPlan.limit.toLocaleString()}
                    </div>
                    {isOverLimit && <div className="text-xs text-red-500 font-bold mt-1">⚠️ EXCEEDS PLAN LIMIT</div>}
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500">Estimated Cost ({duration})</div>
                    <div className="text-2xl font-bold text-indigo-600">${calculatedCost.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}