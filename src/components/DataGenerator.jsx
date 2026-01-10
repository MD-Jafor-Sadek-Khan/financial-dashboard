import React, { useState, useRef } from 'react';
import { Download, Database, AlertCircle, CheckCircle, FileText } from 'lucide-react';

// Predefined data for realistic generation
const DEPARTMENTS = ['Sales', 'Marketing', 'Engineering', 'HR', 'Procurement', 'Finance', 'Customer Support', 'Legal'];
const USERS = [
    'Alice Smith', 'Bob Jones', 'Charlie Day', 'System Auto-Agent', 
    'Calendar Bot v2', 'Invoice Parser Worker', 'Email Classifier', 'Support Triage'
];
const NODES = ['OpenAI Chat Model', 'Summarize Text', 'Classify Sentiment', 'Extract Entities', 'Translate'];

export default function DataGenerator({ pricing }) {
    const [rowCount, setRowCount] = useState(1000000); // Default 1 Million
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedFile, setGeneratedFile] = useState(null);
    
    // Use a Ref to store the data chunks to avoid re-rendering state constantly
    const chunksRef = useRef([]);

    // Get available models from the pricing config to ensure valid data
    const validModels = Object.keys(pricing.openai);

    const generateCSV = () => {
        setIsGenerating(true);
        setProgress(0);
        setGeneratedFile(null);
        chunksRef.current = [];

        // CSV Header
        const header = "Unique Key,Department,User,Execution ID,Time,Node Name,Loop #,Model,Input Tokens,Output Tokens,Cached Tokens,Total Tokens\n";
        chunksRef.current.push(header);

        const CHUNK_SIZE = 5000; // Process 5k rows per tick to keep UI responsive
        let currentRows = 0;

        const generateChunk = () => {
            let chunkString = "";
            
            for (let i = 0; i < CHUNK_SIZE; i++) {
                if (currentRows >= rowCount) break;

                // --- RANDOM DATA GENERATION ---
                const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
                const user = USERS[Math.floor(Math.random() * USERS.length)];
                const node = NODES[Math.floor(Math.random() * NODES.length)];
                const model = validModels[Math.floor(Math.random() * validModels.length)];
                
                // Random Execution ID (1 to 100,000)
                const execId = Math.floor(Math.random() * 100000) + 10000;
                
                // Unique Key logic
                const uniqueKey = `${execId}_${node.replace(/\s/g, '')}_1`;

                // Random Date (Last 30 Days)
                const date = new Date();
                date.setDate(date.getDate() - Math.floor(Math.random() * 30));
                // Random time offset
                date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
                const timeStr = date.toISOString();

                // Tokens
                const input = Math.floor(Math.random() * 2000) + 100; // 100-2100
                const output = Math.floor(Math.random() * 500) + 10;  // 10-510
                const cached = Math.random() > 0.5 ? Math.floor(input * 0.8) : 0; // 50% chance of caching
                const total = input + output;

                // Append Line
                // Format: Unique Key,Department,User,Execution ID,Time,Node Name,Loop #,Model,Input Tokens,Output Tokens,Cached Tokens,Total Tokens
                chunkString += `${uniqueKey},${dept},${user},${execId},${timeStr},${node},1,${model},${input},${output},${cached},${total}\n`;
                
                currentRows++;
            }

            chunksRef.current.push(chunkString);
            const percent = Math.min(100, Math.round((currentRows / rowCount) * 100));
            setProgress(percent);

            if (currentRows < rowCount) {
                // Schedule next chunk
                setTimeout(generateChunk, 0);
            } else {
                // Done!
                finalizeFile();
            }
        };

        // Start the loop
        setTimeout(generateChunk, 0);
    };

    const finalizeFile = () => {
        const blob = new Blob(chunksRef.current, { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        
        setGeneratedFile({
            url,
            name: `simulated_ai_costs_${rowCount}_rows.csv`,
            size: sizeMB
        });
        setIsGenerating(false);
    };

    return (
        <div className="glass-card p-8 rounded-xl max-w-2xl mx-auto mt-8 animate-slide-in">
            <div className="text-center mb-8">
                <div className="inline-flex justify-center items-center p-4 bg-indigo-50 rounded-full text-indigo-600 mb-4">
                    <Database size={40} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Big Data Generator</h2>
                <p className="text-gray-500 mt-2">Generate massive, valid CSV datasets for stress testing.</p>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Rows</label>
                    <select 
                        value={rowCount} 
                        onChange={(e) => setRowCount(parseInt(e.target.value))}
                        disabled={isGenerating}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                        <option value={10000}>10,000 Rows (Tiny)</option>
                        <option value={100000}>100,000 Rows (Small)</option>
                        <option value={500000}>500,000 Rows (Medium)</option>
                        <option value={1000000}>1,000,000 Rows (Standard)</option>
                        <option value={2000000}>2,000,000 Rows (Heavy)</option>
                        <option value={5000000}>5,000,000 Rows (Extreme)</option>
                    </select>
                </div>

                {!isGenerating && !generatedFile && (
                    <button 
                        onClick={generateCSV}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow transition-all flex items-center justify-center gap-2"
                    >
                        <FileText size={20} /> Generate CSV
                    </button>
                )}

                {isGenerating && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium text-gray-600">
                            <span>Generating...</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-75" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="text-xs text-center text-gray-400 mt-2">Please wait, constructing data chunks...</p>
                    </div>
                )}

                {generatedFile && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center animate-slide-in">
                        <div className="flex justify-center text-green-600 mb-2">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-green-800">Generation Complete!</h3>
                        <p className="text-sm text-green-700 mb-4">File Size: {generatedFile.size} MB</p>
                        
                        <a 
                            href={generatedFile.url} 
                            download={generatedFile.name}
                            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow transition-colors"
                        >
                            <Download size={20} /> Download CSV
                        </a>
                        
                        <button 
                            onClick={() => setGeneratedFile(null)} 
                            className="block w-full mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                        >
                            Generate Another
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}