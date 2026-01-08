import React from 'react';
import { Trash2, PlusCircle, Activity } from 'lucide-react';

export default function OpenAISection({ nodes, setNodes, pricing, calculatedCost }) {

    const updateNode = (index, field, value) => {
        const newNodes = [...nodes];
        // Keep name/model as strings, others as numbers
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
            cacheHitRate: 0, // Default to 0% caching
            executionsPerDay: 50
        }]);
    };

    const removeNode = (index) => {
        setNodes(nodes.filter((_, i) => i !== index));
    };

    const getRowCost = (node) => {
        const modelPrice = pricing.openai[node.model];
        if (!modelPrice) return 0;

        const cacheRate = (node.cacheHitRate || 0) / 100;
        const totalInput = node.inputTokens || 0;

        // Price Logic
        const freshPrice = modelPrice.input;
        const cachedPrice = modelPrice.cached !== undefined ? modelPrice.cached : modelPrice.input;

        const inputCost = ((totalInput * (1 - cacheRate) / 1e6) * freshPrice) +
            ((totalInput * cacheRate / 1e6) * cachedPrice);

        const outputCost = (node.outputTokens / 1e6 * modelPrice.output);
        const costPerRun = inputCost + outputCost;

        return costPerRun * (node.executionsPerDay || 0) * 30;
    };

    const totalMonthlyExecutions = nodes.reduce((acc, node) => acc + ((node.executionsPerDay || 0) * 30), 0);

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-6">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Activity className="text-blue-600" size={20} />
                    2. OpenAI Intelligence Costs
                </h2>
                <button onClick={addNode} className="flex items-center text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 font-medium">
                    <PlusCircle size={16} className="mr-1" /> Add Workflow
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 uppercase">
                        <tr>
                            <th className="p-3 w-1/5">Workflow Name</th>
                            <th className="p-3">Model</th>
                            <th className="p-3 w-24">Input Tks</th>
                            <th className="p-3 w-24">Output Tks</th>
                            <th className="p-3 w-24 text-blue-600">Cache Hit %</th>
                            <th className="p-3 w-28 bg-blue-50/50 text-blue-800 border-b-2 border-blue-200">Runs/Day</th>
                            <th className="p-3 text-right">Est. Monthly</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {nodes.map((node, i) => (
                            <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                                <td className="p-2">
                                    <input
                                        className="border rounded w-full p-2 text-gray-700 focus:outline-blue-500"
                                        placeholder="e.g. Invoice Parser"
                                        value={node.name}
                                        onChange={(e) => updateNode(i, 'name', e.target.value)}
                                    />
                                </td>
                                <td className="p-2">
                                    <select
                                        className="border rounded w-full p-2 bg-white"
                                        value={node.model}
                                        onChange={(e) => updateNode(i, 'model', e.target.value)}
                                    >
                                        {Object.entries(pricing.openai).map(([key, val]) => (
                                            <option key={key} value={key}>{val.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="p-2">
                                    <input type="number" className="border rounded w-full p-2 text-center" value={node.inputTokens} onChange={(e) => updateNode(i, 'inputTokens', e.target.value)} />
                                </td>
                                <td className="p-2">
                                    <input type="number" className="border rounded w-full p-2 text-center" value={node.outputTokens} onChange={(e) => updateNode(i, 'outputTokens', e.target.value)} />
                                </td>
                                {/* Cache Percentage Input */}
                                <td className="p-2">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            className="border border-blue-200 rounded w-full p-2 text-center text-blue-600 font-medium"
                                            value={node.cacheHitRate || 0}
                                            onChange={(e) => updateNode(i, 'cacheHitRate', e.target.value)}
                                        />
                                        <span className="absolute right-1 top-2 text-xs text-blue-300">%</span>
                                    </div>
                                </td>
                                <td className="p-2 bg-blue-50/30 border-l border-r border-dashed border-blue-100">
                                    <input
                                        type="number"
                                        className="border border-blue-300 rounded w-full p-2 text-center font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                                        value={node.executionsPerDay}
                                        onChange={(e) => updateNode(i, 'executionsPerDay', e.target.value)}
                                    />
                                </td>
                                <td className="p-2 text-right font-mono font-bold text-gray-700">
                                    ${getRowCost(node).toFixed(2)}
                                </td>
                                <td className="p-2 text-center">
                                    <button onClick={() => removeNode(i)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary Footer */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <div className="flex flex-col justify-center">
                    <div className="text-sm text-gray-500">Total Volume</div>
                    <div className="text-lg font-semibold text-gray-700">
                        {totalMonthlyExecutions.toLocaleString()} <span className="text-sm font-normal text-gray-400">runs / month</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500">Monthly AI Budget</div>
                    <div className="text-3xl font-bold text-indigo-600">${calculatedCost.toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
}