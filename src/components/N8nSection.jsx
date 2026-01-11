import React from 'react';
import { Cpu, Users, Clock } from 'lucide-react';

export default function N8nSection({ data, setData, pricing, calculatedCost }) {
    const { plan, users, executionsPerUser, duration } = data;
    const currentPlan = pricing.n8n[plan];
    const totalExecutions = users * executionsPerUser;
    const isOverLimit = totalExecutions > currentPlan.limit;

    // Styles matching Daily Analytics inputs
    const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg bg-white/50 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all";
    const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5";

    return (
        <div className="glass-card p-6 rounded-xl animate-slide-in">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                    <Cpu size={20} />
                </div>
                <h2 className="text-lg font-bold text-gray-800">1. Automation platform (N8n)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label className={labelClass}>Plan</label>
                    <select
                        className={inputClass}
                        value={plan}
                        onChange={(e) => setData({ ...data, plan: e.target.value })}
                    >
                        {Object.entries(pricing.n8n).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className={labelClass}>Billing cycle</label>
                    <select
                        className={inputClass}
                        value={duration}
                        onChange={(e) => setData({ ...data, duration: e.target.value })}
                    >
                        <option value="monthly">Monthly Billing</option>
                        <option value="yearly">Yearly (Discounted)</option>
                    </select>
                </div>

                <div>
                    <label className={labelClass}>Active users</label>
                    <div className="relative">
                        <Users size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="number" 
                            className={`${inputClass} pl-9`}
                            value={users}
                            min="0"
                            onChange={(e) => setData({ ...data, users: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Runs per user</label>
                    <div className="relative">
                        <Clock size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="number" 
                            className={`${inputClass} pl-9`}
                            value={executionsPerUser}
                            min="0"
                            onChange={(e) => setData({ ...data, executionsPerUser: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                </div>
            </div>

            {/* KPI Summary Card Style */}
            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl flex justify-between items-center">
                <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total runs</div>
                    <div className={`text-lg font-bold ${isOverLimit ? 'text-red-600' : 'text-gray-800'}`}>
                        {totalExecutions.toLocaleString()} <span className="text-sm font-normal text-gray-400">/ {currentPlan.limit.toLocaleString()} included</span>
                    </div>
                    {isOverLimit && <div className="text-[10px] text-red-500 font-bold mt-1 bg-red-50 inline-block px-1.5 py-0.5 rounded">⚠️ OVER PLAN LIMIT</div>}
                </div>
                <div className="text-right">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Monthly spend</div>
                    <div className="text-2xl font-extrabold text-gray-900">${calculatedCost.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}
