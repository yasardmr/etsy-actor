/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: {
        maxRetries?: number;
        initialDelay?: number;
        maxDelay?: number;
        retryIf?: (error: any) => boolean;
    } = {},
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 30000,
        retryIf = () => true,
    } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            const shouldRetry = retryIf(error);

            if (attempt === maxRetries || !shouldRetry) {
                throw error;
            }

            const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
            console.log(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
            console.log(`   Error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Should not reach here');
}

/**
 * Check if error is retryable (network errors, timeouts, rate limits)
 */
export function isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';

    // Network errors
    if (message.includes('timeout')) return true;
    if (message.includes('econnreset')) return true;
    if (message.includes('econnrefused')) return true;
    if (message.includes('socket hang up')) return true;

    // HTTP errors
    if (message.includes('status code 429')) return true; // Rate limit
    if (message.includes('status code 503')) return true; // Service unavailable
    if (message.includes('status code 504')) return true; // Gateway timeout

    // Playwright errors
    if (message.includes('navigation timeout')) return true;
    if (message.includes('net::err')) return true;

    return false;
}
