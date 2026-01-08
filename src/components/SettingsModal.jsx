import React, { useState } from 'react';
import { X, Save, Database, Cpu, Zap } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, pricing, setPricing }) {
    const [tempPricing, setTempPricing] = useState(JSON.parse(JSON.stringify(pricing)));
    const [activeTab, setActiveTab] = useState('openai'); // openai | n8n | pinecone

    const handleOpenAIChange = (model, field, value) => {
        setTempPricing(prev => ({
            ...prev,
            openai: {
                ...prev.openai,
                [model]: { ...prev.openai[model], [field]: parseFloat(value) }
            }
        }));
    };

    const handleN8nChange = (plan, field, value) => {
        setTempPricing(prev => ({
            ...prev,
            n8n: {
                ...prev.n8n,
                [plan]: { ...prev.n8n[plan], [field]: parseFloat(value) }
            }
        }));
    };

    const handlePineconeChange = (field, value) => {
        setTempPricing(prev => ({
            ...prev,
            pinecone: { ...prev.pinecone, [field]: parseFloat(value) }
        }));
    };

    const handlePineconePlanChange = (plan, field, value) => {
        setTempPricing(prev => ({
            ...prev,
            pinecone: {
                ...prev.pinecone,
                plans: {
                    ...prev.pinecone.plans,
                    [plan]: { ...prev.pinecone.plans[plan], [field]: parseFloat(value) }
                }
            }
        }));
    };

    const save = () => {
        setPricing(tempPricing);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b shrink-0 bg-white">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Global Pricing Configuration</h2>
                        <p className="text-sm text-gray-500">Update the base rates used for all calculations.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b bg-gray-50 shrink-0">
                    <button
                        onClick={() => setActiveTab('openai')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'openai' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Zap size={18} /> OpenAI Intelligence
                    </button>
                    <button
                        onClick={() => setActiveTab('n8n')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'n8n' ? 'border-orange-600 text-orange-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Cpu size={18} /> N8n Infrastructure
                    </button>
                    <button
                        onClick={() => setActiveTab('pinecone')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pinecone' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Database size={18} /> Pinecone Memory
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 bg-gray-50/30">

                    {/* --- OPENAI TAB --- */}
                    {activeTab === 'openai' && (
                        <div>
                            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 mb-2 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <div>Model Name</div>
                                <div>Input ($)</div>
                                <div className="text-blue-600">Cached ($)</div>
                                <div>Output ($)</div>
                            </div>
                            <div className="space-y-2">
                                {Object.entries(tempPricing.openai).map(([key, data]) => (
                                    <div key={key} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 items-center bg-white p-2 rounded border border-gray-200 hover:border-blue-300 transition-colors">
                                        <div className="font-medium text-gray-700 text-sm truncate pr-2">{data.label}</div>
                                        <input
                                            type="number" step="0.001"
                                            className="border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                            value={data.input}
                                            onChange={(e) => handleOpenAIChange(key, 'input', e.target.value)}
                                        />
                                        <input
                                            type="number" step="0.001"
                                            className="border border-blue-200 bg-blue-50 rounded px-2 py-1.5 text-sm text-blue-800 focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                            value={data.cached || 0}
                                            onChange={(e) => handleOpenAIChange(key, 'cached', e.target.value)}
                                        />
                                        <input
                                            type="number" step="0.001"
                                            className="border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                            value={data.output}
                                            onChange={(e) => handleOpenAIChange(key, 'output', e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- N8N TAB --- */}
                    {activeTab === 'n8n' && (
                        <div className="space-y-6">
                            {Object.entries(tempPricing.n8n).map(([planKey, planData]) => (
                                <div key={planKey} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex justify-between">
                                        {planData.label.split('(')[0].trim()} Plan
                                        <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">ID: {planKey}</span>
                                    </h3>
                                    <div className="grid grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Monthly Price ($)</label>
                                            <input
                                                type="number"
                                                className="border rounded w-full p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={planData.price}
                                                onChange={(e) => handleN8nChange(planKey, 'price', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Included Executions</label>
                                            <input
                                                type="number"
                                                className="border rounded w-full p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={planData.limit}
                                                onChange={(e) => handleN8nChange(planKey, 'limit', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Yearly Discount (0-1)</label>
                                            <input
                                                type="number" step="0.01" max="1"
                                                className="border rounded w-full p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                                value={planData.yearlyDiscountPercent}
                                                onChange={(e) => handleN8nChange(planKey, 'yearlyDiscountPercent', e.target.value)}
                                            />
                                            <div className="text-xs text-gray-400 mt-1">
                                                e.g. 0.20 = 20% off
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* --- PINECONE TAB --- */}
                    {activeTab === 'pinecone' && (
                        <div className="space-y-6">
                            {/* Usage Rates */}
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Serverless Usage Rates</h3>
                                <div className="grid grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Storage ($ per GB/mo)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="border rounded w-full p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={tempPricing.pinecone.storage}
                                            onChange={(e) => handlePineconeChange('storage', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Read ($ per 1M units)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="border rounded w-full p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={tempPricing.pinecone.read}
                                            onChange={(e) => handlePineconeChange('read', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Write ($ per 1M units)</label>
                                        <input
                                            type="number" step="0.01"
                                            className="border rounded w-full p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={tempPricing.pinecone.write}
                                            onChange={(e) => handlePineconeChange('write', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Plan Minimums */}
                            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Plan Base Fees / Minimums</h3>
                                <div className="space-y-4">
                                    {Object.entries(tempPricing.pinecone.plans).map(([planKey, planData]) => (
                                        <div key={planKey} className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-700">{planData.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-500">Min Monthly Cost: $</span>
                                                <input
                                                    type="number"
                                                    className="border rounded w-32 p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={planData.min}
                                                    onChange={(e) => handlePineconePlanChange(planKey, 'min', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-white shrink-0">
                    <button onClick={save} className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 flex items-center justify-center gap-2 font-bold shadow-md transition-all active:scale-[0.99]">
                        <Save size={18} /> Save Global Settings
                    </button>
                </div>
            </div>
        </div>
    );
}