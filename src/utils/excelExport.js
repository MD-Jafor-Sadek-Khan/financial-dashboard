import XLSX from 'xlsx-js-style';

/**
 * World-Class Excel Export Utility
 * Uses xlsx-js-style to apply corporate branding, colors, and formatting.
 */

// --- 1. THEME CONFIGURATION ---
const STYLES = {
    header: {
        fill: { fgColor: { rgb: "4F46E5" } }, // Indigo 600
        font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
        alignment: { horizontal: "center", vertical: "center" },
        border: { bottom: { style: "thin", color: { rgb: "000000" } } }
    },
    userHeader: {
        fill: { fgColor: { rgb: "E0E7FF" } }, // Indigo 100
        font: { color: { rgb: "3730A3" }, bold: true, sz: 11 }, // Indigo 800
        alignment: { horizontal: "left" }
    },
    rowTotal: {
        fill: { fgColor: { rgb: "F3F4F6" } }, // Gray 100
        font: { bold: true },
        border: { top: { style: "thin" } }
    },
    grandTotal: {
        fill: { fgColor: { rgb: "10B981" } }, // Emerald 500
        font: { color: { rgb: "FFFFFF" }, bold: true, sz: 14 },
        alignment: { horizontal: "right" }
    },
    currency: {
        numFmt: "$#,##0.00" // Excel Native Accounting Format
    },
    number: {
        numFmt: "#,##0"
    }
};

const sanitizeSheetName = (name) => {
    return (name || "Unknown").replace(/[\/\\\?\*\[\]]/g, "_").substring(0, 30);
};

export const generateExcelReport = (rawData, filename = 'AI_Cost_Report.xlsx') => {
    if (!rawData || rawData.length === 0) {
        alert("No data to export");
        return;
    }

    // --- 2. DATA PROCESSING (Hierarchy Building) ---
    // Grouping: Dept -> User -> Node
    const hierarchy = {};

    rawData.forEach(row => {
        const dept = row.dpt || "Unassigned";
        const user = row.usr || "Unknown";
        const node = row.nd || "Unknown Node";
        const model = row.mdl || "Unknown";
        const key = `${node} (${model})`;

        if (!hierarchy[dept]) hierarchy[dept] = {};
        if (!hierarchy[dept][user]) hierarchy[dept][user] = {};
        if (!hierarchy[dept][user][key]) {
            hierarchy[dept][user][key] = {
                nodeName: node,
                model: model,
                inputTokens: 0,
                outputTokens: 0,
                cost: 0,
                count: 0
            };
        }

        const entry = hierarchy[dept][user][key];
        entry.inputTokens += (row.ti || 0);
        entry.outputTokens += (row.to || 0);
        entry.cost += (row.c || 0);
        entry.count += 1;
    });

    const wb = XLSX.utils.book_new();

    // --- 3. SHEET GENERATION LOOP ---
    Object.keys(hierarchy).sort().forEach(deptName => {
        const deptData = hierarchy[deptName];
        
        // We build the sheet cell by cell (AoA - Array of Arrays) to control styles strictly
        const wsData = [];
        
        let deptTotalCost = 0;

        // Iterate Users
        Object.keys(deptData).sort().forEach(userName => {
            const userNodes = deptData[userName];

            // A. User Header Block (Styled Row)
            wsData.push([
                { v: `USER: ${userName.toUpperCase()}`, s: STYLES.userHeader }, 
                { v: "", s: STYLES.userHeader }, 
                { v: "", s: STYLES.userHeader }, 
                { v: "", s: STYLES.userHeader }, 
                { v: "", s: STYLES.userHeader }, 
                { v: "", s: STYLES.userHeader }
            ]);

            // B. Column Headers
            const headers = ["Workflow Step", "Model", "Runs", "Input Tokens", "Output Tokens", "Cost ($)"];
            wsData.push(headers.map(h => ({ v: h, s: STYLES.header })));

            let userTotalCost = 0;
            let userTotalInput = 0;
            let userTotalOutput = 0;
            let userTotalRuns = 0;

            // C. Data Rows
            Object.values(userNodes)
                .sort((a, b) => b.cost - a.cost)
                .forEach(node => {
                    wsData.push([
                        { v: node.nodeName },
                        { v: node.model },
                        { v: node.count, s: STYLES.number },
                        { v: node.inputTokens, s: STYLES.number },
                        { v: node.outputTokens, s: STYLES.number },
                        { v: node.cost, s: STYLES.currency }
                    ]);

                    userTotalCost += node.cost;
                    userTotalInput += node.inputTokens;
                    userTotalOutput += node.outputTokens;
                    userTotalRuns += node.count;
                });

            // D. User Total Row
            wsData.push([
                { v: "TOTAL FOR " + userName, s: STYLES.rowTotal },
                { v: "", s: STYLES.rowTotal },
                { v: userTotalRuns, s: { ...STYLES.rowTotal, ...STYLES.number } },
                { v: userTotalInput, s: { ...STYLES.rowTotal, ...STYLES.number } },
                { v: userTotalOutput, s: { ...STYLES.rowTotal, ...STYLES.number } },
                { v: userTotalCost, s: { ...STYLES.rowTotal, ...STYLES.currency } }
            ]);

            // Spacing rows between users
            wsData.push([{}, {}, {}, {}, {}, {}]); 
            
            deptTotalCost += userTotalCost;
        });

        // E. Department Grand Total
        wsData.push([
            { v: "DEPARTMENT GRAND TOTAL", s: STYLES.grandTotal },
            { v: "", s: STYLES.grandTotal },
            { v: "", s: STYLES.grandTotal },
            { v: "", s: STYLES.grandTotal },
            { v: "", s: STYLES.grandTotal },
            { v: deptTotalCost, s: { ...STYLES.grandTotal, ...STYLES.currency } }
        ]);

        // Create Sheet
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Column Widths (Visual Polish)
        ws['!cols'] = [
            { wch: 40 }, // Node Name
            { wch: 25 }, // Model
            { wch: 12 }, // Runs
            { wch: 15 }, // Input
            { wch: 15 }, // Output
            { wch: 18 }  // Cost
        ];

        // Add Sheet to Workbook
        XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(deptName));
    });

    // --- 4. SUMMARY SHEET (Cover Page) ---
    // We create a dashboard-style cover sheet as the first tab
    const summaryData = [];
    
    // Title
    summaryData.push([{ v: "AI SPEND EXECUTIVE REPORT", s: { font: { bold: true, sz: 18, color: { rgb: "4F46E5" } } } }]);
    summaryData.push([{ v: `Generated: ${new Date().toLocaleString()}`, s: { font: { italic: true, color: { rgb: "6B7280" } } } }]);
    summaryData.push([]); // Spacer

    // Table Header
    summaryData.push([
        { v: "Department", s: STYLES.header },
        { v: "Total Spend", s: STYLES.header }
    ]);

    let grandTotal = 0;
    Object.keys(hierarchy).sort().forEach(dept => {
        let dCost = 0;
        Object.values(hierarchy[dept]).forEach(u => {
            Object.values(u).forEach(n => dCost += n.cost);
        });
        grandTotal += dCost;
        
        summaryData.push([
            { v: dept, s: { font: { bold: true } } },
            { v: dCost, s: STYLES.currency }
        ]);
    });

    // Grand Total Line
    summaryData.push([
        { v: "TOTAL ORGANIZATION SPEND", s: STYLES.grandTotal },
        { v: grandTotal, s: { ...STYLES.grandTotal, ...STYLES.currency } }
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary", true);

    // Write File
    XLSX.writeFile(wb, filename);
};