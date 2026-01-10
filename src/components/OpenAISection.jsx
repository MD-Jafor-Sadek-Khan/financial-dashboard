import React from 'react';
import { Trash2, PlusCircle, Zap, Sparkles } from 'lucide-react';

export default function OpenAISection({ nodes, setNodes, pricing, calculatedCost }) {

    const updateNode = (index, field, value) => {
        const newNodes = [...nodes];
        newNodes[index][field] = (field === 'name' || field === 'model')
            ? value
            : (parseFloat(value) || 0);
        setNodes(newNodes);
    };

    const addNode = () => {
        setNodes([...nodes, {
            name: 'New Workflow',
            model: 'gpt-4o-mini',
            inputTokens: 1000,
            outputTokens: 200,
            cacheHitRate: 0,
            executionsPerDay: 50
        }]);
    };

    const removeNode = (index) => {
        setNodes(nodes.filter((_, i) => i !== index));
    };

    const bulkUpdateModel = (newModel) => {
        if (window.confirm(`Switch all ${nodes.length} workflows to ${newModel}?`)) {
            const updatedNodes = nodes.map(node => ({ ...node, model: newModel }));
            setNodes(updatedNodes);
        }
    };

    const getRowCost = (node) => {
        const modelPrice = pricing.openai[node.model];
        if (!modelPrice) return 0;

        const cacheRate = (node.cacheHitRate || 0) / 100;
        const totalInput = node.inputTokens || 0;
        const freshPrice = modelPrice.input;
        const cachedPrice = modelPrice.cached !== undefined ? modelPrice.cached : modelPrice.input;

        const inputCost = ((totalInput * (1 - cacheRate) / 1e6) * freshPrice) +
            ((totalInput * cacheRate / 1e6) * cachedPrice);
        const outputCost = (node.outputTokens / 1e6 * modelPrice.output);
        
        return (inputCost + outputCost) * (node.executionsPerDay || 0) * 30; // Approx monthly for row view
    };

    const totalMonthlyExecutions = nodes.reduce((acc, node) => acc + ((node.executionsPerDay || 0) * 30), 0);

    // Input style matching design system
    const inputTableClass = "w-full bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 focus:ring-0 px-2 py-1 text-sm outline-none transition-colors text-center";
    const selectClass = "bg-transparent text-sm w-full outline-none cursor-pointer text-gray-700 py-1";

    return (
        <div className="glass-card p-6 rounded-xl mt-6 animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                        <Zap size={20} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800">2. OpenAI Intelligence</h2>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select 
                            className="appearance-none bg-gray-50 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg pl-3 pr-8 py-2 hover:bg-white hover:border-gray-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onChange={(e) => bulkUpdateModel(e.target.value)}
                            value=""
                        >
                            <option value="" disabled>Bulk Change Model</option>
                            {Object.entries(pricing.openai).map(([key, val]) => (
                                 <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                        <Sparkles size={14} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                    </div>

                    <button onClick={addNode} className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                        <PlusCircle size={14} /> ADD WORKFLOW
                    </button>
                </div>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-lg">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-50/80">
                        <tr>
                            <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Workflow Name</th>
                            <th className="py-3 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Model</th>
                            <th className="py-3 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">In Tks</th>
                            <th className="py-3 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Out Tks</th>
                            <th className="py-3 px-2 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">Cache %</th>
                            <th className="py-3 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center bg-gray-100/50">Runs/Day</th>
                            <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Est. Monthly</th>
                            <th className="py-3 px-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {nodes.map((node, i) => (
                            <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                                <td className="p-2">
                                    <input
                                        className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded px-2 py-1 outline-none text-gray-800 font-medium placeholder-gray-300 text-left"
                                        placeholder="Name this workflow..."
                                        value={node.name}
                                        onChange={(e) => updateNode(i, 'name', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <select
                                        className={selectClass}
                                        value={node.model}
                                        onChange={(e) => updateNode(i, 'model', e.target.value)}
                                    >
                                        {Object.entries(pricing.openai).map(([key, val]) => (
                                            <option key={key} value={key}>{val.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="p-2">
                                    <input type="number" min="0" className={inputTableClass} value={node.inputTokens} onChange={(e) => updateNode(i, 'inputTokens', e.target.value)} />
                                </td>
                                <td className="p-2">
                                    <input type="number" min="0" className={inputTableClass} value={node.outputTokens} onChange={(e) => updateNode(i, 'outputTokens', e.target.value)} />
                                </td>
                                <td className="p-2">
                                    <div className="relative w-16 mx-auto">
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            className={`${inputTableClass} text-blue-600 font-bold pr-4`}
                                            value={node.cacheHitRate || 0}
                                            onChange={(e) => updateNode(i, 'cacheHitRate', e.target.value)}
                                        />
                                        <span className="absolute right-1 top-1 text-xs text-blue-300">%</span>
                                    </div>
                                </td>
                                <td className="p-2 bg-gray-50/30 border-l border-r border-gray-100">
                                    <input
                                        type="number"
                                        min="0"
                                        className={`${inputTableClass} font-bold text-gray-900`}
                                        value={node.executionsPerDay}
                                        onChange={(e) => updateNode(i, 'executionsPerDay', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 px-4 text-right font-mono text-gray-600">
                                    ${getRowCost(node).toFixed(2)}
                                </td>
                                <td className="p-2 text-center">
                                    <button onClick={() => removeNode(i)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer Summary */}
            <div className="mt-6 bg-gray-50/50 border border-gray-100 p-4 rounded-xl flex justify-between items-center">
                <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Total Throughput</div>
                    <div className="text-lg font-bold text-gray-800">
                        {totalMonthlyExecutions.toLocaleString()} <span className="text-sm font-normal text-gray-400">runs / month</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Monthly AI Cost</div>
                    <div className="text-2xl font-extrabold text-gray-900">${calculatedCost.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}