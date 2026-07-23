/**
 * Format currency values in Indian format (Cr, L, K)
 */
export function formatCurrency(
    value: number, 
    currency: string = '₹'
): string {
    // Handle null, undefined, or NaN
    if (!value && value !== 0) return `${currency}0`;
    if (value === 0) return `${currency}0`;
    
    // Handle negative values
    const isNegative = value < 0;
    const absValue = Math.abs(value);
    
    let formattedValue: string;
    let suffix: string = '';
    
    // Indian number system: Cr (Crore = 10,000,000), L (Lakh = 100,000), K (Thousand = 1,000)
    if (absValue >= 10_000_000) {
        formattedValue = (absValue / 10_000_000).toFixed(1);
        suffix = 'Cr';
    } else if (absValue >= 100_000) {
        formattedValue = (absValue / 100_000).toFixed(1);
        suffix = 'L';
    } else if (absValue >= 1_000) {
        formattedValue = (absValue / 1_000).toFixed(1);
        suffix = 'K';
    } else {
        formattedValue = absValue.toFixed(0);
    }
    
    // Remove trailing .0 if present
    if (formattedValue.includes('.')) {
        formattedValue = formattedValue.replace(/\.0$/, '');
    }
    
    return `${isNegative ? '-' : ''}${currency}${formattedValue}${suffix}`;
}

/**
 * Format numbers with Indian suffixes (Cr, L, K)
 */
export function formatNumber(value: number): string {
    if (!value && value !== 0) return '0';
    if (value === 0) return '0';
    
    const absValue = Math.abs(value);
    
    if (absValue >= 10_000_000) {
        return `${(absValue / 10_000_000).toFixed(1)}Cr`;
    }
    if (absValue >= 100_000) {
        return `${(absValue / 100_000).toFixed(1)}L`;
    }
    if (absValue >= 1_000) {
        return `${(absValue / 1_000).toFixed(1)}K`;
    }
    return absValue.toFixed(0);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(1)}%`;
}

/**
 * Format currency with full precision (for tooltips, etc.)
 */
export function formatFullCurrency(
    value: number, 
    currency: string = '₹'
): string {
    if (!value && value !== 0) return `${currency}0`;
    
    // Indian number formatting with commas
    return `${currency}${value.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Format compact currency for small spaces
 */
export function formatCompactCurrency(
    value: number,
    currency: string = '₹'
): string {
    if (!value && value !== 0) return `${currency}0`;
    
    const absValue = Math.abs(value);
    
    if (absValue >= 10_000_000) {
        return `${currency}${(absValue / 10_000_000).toFixed(1)}Cr`;
    }
    if (absValue >= 100_000) {
        return `${currency}${(absValue / 100_000).toFixed(1)}L`;
    }
    if (absValue >= 1_000) {
        return `${currency}${(absValue / 1_000).toFixed(1)}K`;
    }
    return `${currency}${absValue.toFixed(0)}`;
}
