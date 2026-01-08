// Helper to get actual days in the current month (e.g., 28, 30, or 31)
export const getDaysInCurrentMonth = () => {
    const now = new Date();
    // Day 0 of the next month is the last day of the current month
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
};

export const calculateN8nCost = (data, pricing) => {
    const { plan, duration } = data;
    const currentPlan = pricing.n8n[plan];

    if (!currentPlan) return 0;

    let monthlyCost = currentPlan.price;

    // Apply discount if yearly, but return monthly equivalent
    if (duration === 'yearly') {
        const discount = currentPlan.yearlyDiscountPercent || 0;
        monthlyCost = monthlyCost * (1 - discount);
    }

    return monthlyCost;
};

export const calculateOpenAICost = (nodes, pricing) => {
    // Dynamically get days for *this specific month*
    const daysInMonth = getDaysInCurrentMonth(); 

    return nodes.reduce((acc, node) => {
        const modelPrice = pricing.openai[node.model];
        if (!modelPrice) return acc;

        // Default cache rate to 0% if not set
        const cacheRate = (node.cacheHitRate || 0) / 100;
        const totalInput = node.inputTokens || 0;

        // 1. Calculate weighted Input Cost (Fresh vs Cached)
        const freshPrice = modelPrice.input;
        const cachedPrice = modelPrice.cached !== undefined ? modelPrice.cached : modelPrice.input;

        const freshTokens = totalInput * (1 - cacheRate);
        const cachedTokens = totalInput * cacheRate;

        // Cost per 1M tokens
        const inputCost = (freshTokens / 1000000 * freshPrice) + (cachedTokens / 1000000 * cachedPrice);

        // 2. Output Cost per 1M tokens
        const outputCost = (node.outputTokens / 1000000) * modelPrice.output;

        const costPerExecution = inputCost + outputCost;

        // 3. Scale by Daily Volume -> Monthly
        const dailyExecutions = parseFloat(node.executionsPerDay) || 0;
        
        // Uses actual calendar days instead of a flat 30
        const monthlyCost = costPerExecution * dailyExecutions * daysInMonth;

        return acc + monthlyCost;
    }, 0);
};

export const calculatePineconeCost = (data, pricing) => {
    const { plan, storageGB, readUnits, writeUnits } = data;
    const rates = pricing.pinecone;
    const planDetails = rates.plans[plan];

    if (!planDetails) return 0;

    const storageCost = storageGB * rates.storage;
    const readCost = (readUnits / 1000000) * rates.read;
    const writeCost = (writeUnits / 1000000) * rates.write;
    const rawUsageCost = storageCost + readCost + writeCost;

    // Serverless usually charges the greater of Usage vs Minimum
    return Math.max(rawUsageCost, planDetails.min);
};