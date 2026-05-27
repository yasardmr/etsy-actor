import { Page } from 'rebrowser-playwright';
import { createCursor } from 'ghost-cursor-playwright';

/**
 * Human behavior simulation for DataDome bypass
 *
 * Implements realistic mouse movements, scrolling, and timing patterns
 * based on behavioral analysis research.
 */
export class HumanBehavior {
    private cursor: any = null; // Ghost cursor instance
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Initialize ghost cursor for human-like mouse movements with Bezier curves
     * CRITICAL: createCursor returns a Promise
     */
    async initialize(): Promise<void> {
        try {
            // Cast to any to avoid type conflicts between playwright versions
            this.cursor = await createCursor(this.page as any);
            console.log('   ✓ Ghost cursor initialized');
        } catch (error: any) {
            console.log(`   ⚠️  Ghost cursor initialization failed: ${error.message}`);
        }
    }

    /**
     * Calculate reading time based on content (Fitts's Law approximation)
     * Average reading speed: 200-250 words/min
     */
    private calculateReadingTime(elementCount: number = 5): number {
        const wordsVisible = elementCount * (10 + Math.random() * 10);
        const readingSpeed = 200 + Math.random() * 50; // words per minute
        const baseTime = (wordsVisible / readingSpeed) * 60 * 1000; // ms

        // Add variance (±30%)
        const variance = baseTime * (0.7 + Math.random() * 0.6);
        return Math.max(2000, variance); // Minimum 2 seconds
    }

    /**
     * Human-like scrolling with mouse movement and variable speed
     */
    async naturalScroll(scrollCount: number = 3): Promise<void> {
        for (let i = 0; i < scrollCount; i++) {
            // Variable scroll distance (not uniform)
            const scrollAmount = 150 + Math.random() * 450; // 150-600px
            const scrollSpeed = 50 + Math.random() * 150;

            // Move mouse to random position first (humans look before scrolling)
            if (this.cursor) {
                try {
                    const randomPoint = await this.cursor.getRandomPointOnViewport(0.1);
                    await this.cursor.actions.move(randomPoint, {
                        waitBeforeMove: [200, 800]
                    });
                } catch (error) {
                    // Fallback if cursor fails - continue anyway
                }
            }

            // Delay before scroll (humans pause)
            await this.randomDelay(200, 800);

            // Perform scroll with smooth behavior
            await this.page.evaluate((distance) => {
                window.scrollBy({
                    top: distance,
                    behavior: 'smooth'
                });
            }, scrollAmount);

            // Wait for scroll + reading time
            const waitTime = scrollSpeed + this.calculateReadingTime(1);
            await this.randomDelay(waitTime * 0.8, waitTime * 1.2);
        }
    }

    /**
     * Random mouse movements across page (simulates browsing)
     */
    async randomMouseMovements(count: number = 3): Promise<void> {
        if (!this.cursor) {
            return;
        }

        for (let i = 0; i < count; i++) {
            try {
                // Get random point on viewport (with 10% padding from edges)
                const randomPoint = await this.cursor.getRandomPointOnViewport(0.1);

                // Move with Bezier curves and random timing
                await this.cursor.actions.move(randomPoint, {
                    waitBeforeMove: [500, 1500]  // Random delay before moving
                });
            } catch (error) {
                // Continue even if cursor movement fails
            }
        }
    }

    /**
     * Simulate human reading page content with mouse movements
     */
    async readPageContent(duration?: number): Promise<void> {
        const readTime = duration || this.calculateReadingTime(5);

        // Break reading into chunks with mouse movements
        const chunks = 3 + Math.floor(Math.random() * 3);
        const chunkTime = readTime / chunks;

        for (let i = 0; i < chunks; i++) {
            await this.randomMouseMovements(1);
            await this.randomDelay(chunkTime * 0.8, chunkTime * 1.2);
        }
    }

    /**
     * Random delay with normal distribution (not uniform)
     * Humans don't have perfectly uniform timing
     */
    private async randomDelay(minMs: number, maxMs: number): Promise<void> {
        // Use Box-Muller transform for normal distribution
        const mean = (minMs + maxMs) / 2;
        const stdDev = (maxMs - minMs) / 6;

        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        let delay = mean + z0 * stdDev;
        delay = Math.max(minMs, Math.min(maxMs, delay)); // Clamp to range

        await new Promise(resolve => setTimeout(resolve, delay));
    }
}
