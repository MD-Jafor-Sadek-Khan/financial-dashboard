// Helper to get actual days in the current month (e.g., 28, 30, or 31)
export const getDaysInCurrentMonth = () => {
    const now = new Date();
    // Day 0 of the next month is the last day of the current month
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
};

export const calculateN8nCost = (data, pricing) => {
    if (!data || !pricing || !pricing.n8n) return 0;
    
    const { plan, duration } = data;
    const currentPlan = pricing.n8n[plan];

    if (!currentPlan) return 0;

    let monthlyCost = Number(currentPlan.price) || 0;

    // Apply discount if yearly, but return monthly equivalent
    if (duration === 'yearly') {
        const discount = Number(currentPlan.yearlyDiscountPercent) || 0;
        monthlyCost = monthlyCost * (1 - discount);
    }

    return Math.max(0, monthlyCost);
};

export const calculateOpenAICost = (nodes, pricing) => {
    if (!nodes || !pricing || !pricing.openai) return 0;

    // Dynamically get days for *this specific month*
    const daysInMonth = getDaysInCurrentMonth(); 

    return nodes.reduce((acc, node) => {
        const modelPrice = pricing.openai[node.model];
        // Graceful fallback if model doesn't exist in pricing (avoid NaN)
        if (!modelPrice) return acc;

        // Sanitize inputs (prevent negative numbers)
        const cacheRate = Math.min(100, Math.max(0, (Number(node.cacheHitRate) || 0))) / 100;
        const totalInput = Math.max(0, Number(node.inputTokens) || 0);
        const outputTokens = Math.max(0, Number(node.outputTokens) || 0);
        const dailyExecutions = Math.max(0, Number(node.executionsPerDay) || 0);

        // 1. Calculate weighted Input Cost (Fresh vs Cached)
        const freshPrice = Number(modelPrice.input) || 0;
        const cachedPrice = modelPrice.cached !== undefined ? Number(modelPrice.cached) : freshPrice;

        const freshTokens = totalInput * (1 - cacheRate);
        const cachedTokens = totalInput * cacheRate;

        // Cost per 1M tokens
        const inputCost = (freshTokens / 1000000 * freshPrice) + (cachedTokens / 1000000 * cachedPrice);

        // 2. Output Cost per 1M tokens
        const outputCost = (outputTokens / 1000000) * (Number(modelPrice.output) || 0);

        const costPerExecution = inputCost + outputCost;

        // 3. Scale by Daily Volume -> Monthly
        // Uses actual calendar days instead of a flat 30
        const monthlyCost = costPerExecution * dailyExecutions * daysInMonth;

        return acc + monthlyCost;
    }, 0);
};

export const calculatePineconeCost = (data, pricing) => {
    if (!data || !pricing || !pricing.pinecone) return 0;

    const { plan, storageGB, readUnits, writeUnits } = data;
    const rates = pricing.pinecone;
    const planDetails = rates.plans && rates.plans[plan];

    if (!planDetails) return 0;

    // Sanitize inputs
    const storage = Math.max(0, Number(storageGB) || 0);
    const read = Math.max(0, Number(readUnits) || 0);
    const write = Math.max(0, Number(writeUnits) || 0);

    const storageCost = storage * (Number(rates.storage) || 0);
    const readCost = (read / 1000000) * (Number(rates.read) || 0);
    const writeCost = (write / 1000000) * (Number(rates.write) || 0);
    
    const rawUsageCost = storageCost + readCost + writeCost;

    // Serverless usually charges the greater of Usage vs Minimum
    const minCost = Number(planDetails.min) || 0;
    
    return Math.max(rawUsageCost, minCost);
};