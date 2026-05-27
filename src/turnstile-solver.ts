import { Page } from 'rebrowser-playwright';
import axios from 'axios';

export class TurnstileSolver {
    private apiKey: string | null;
    private enabled: boolean;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || null;
        this.enabled = !!apiKey;
    }

    /**
     * Solve Turnstile or DataDome using CapSolver API
     * Turnstile: $1.20/1000 solves
     * DataDome: $2.99/1000 solves
     * Speed: 5-30 seconds
     * Success rate: 95%+
     */
    private async solveWithCapSolver(siteUrl: string, challengeType: string, metadata?: any): Promise<string | null> {
        if (!this.apiKey) {
            console.error('   ❌ CapSolver API key not provided');
            return null;
        }

        try {
            // Build task based on challenge type
            let task: any;

            if (challengeType === 'datadome') {
                // DataDome requires captchaUrl and userAgent
                task = {
                    type: 'DatadomeSliderTask',
                    websiteURL: siteUrl,
                    captchaUrl: metadata?.captchaUrl || siteUrl,
                    userAgent: metadata?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    proxy: metadata?.proxy || undefined,
                };
            } else {
                // Cloudflare Turnstile
                task = {
                    type: 'AntiTurnstileTaskProxyLess',
                    websiteURL: siteUrl,
                    websiteKey: metadata?.siteKey || '',
                };
            }

            console.log(`   📤 Sending ${challengeType} solve request to CapSolver...`);

            // Step 1: Create task
            const createResponse = await axios.post('https://api.capsolver.com/createTask', {
                clientKey: this.apiKey,
                task
            });

            if (createResponse.data.errorId > 0) {
                console.error(`   ❌ CapSolver error: ${createResponse.data.errorDescription}`);
                return null;
            }

            const taskId = createResponse.data.taskId;
            console.log(`   🔄 Task created (ID: ${taskId}), waiting for solution...`);

            // Step 2: Poll for solution (DataDome takes longer - up to 120 seconds)
            const maxAttempts = challengeType === 'datadome' ? 120 : 60;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds

                const resultResponse = await axios.post('https://api.capsolver.com/getTaskResult', {
                    clientKey: this.apiKey,
                    taskId: taskId
                });

                if (resultResponse.data.status === 'ready') {
                    console.log(`   ✅ Solution received in ${(attempt + 1) * 2} seconds`);
                    // DataDome returns cookie, Turnstile returns token
                    return resultResponse.data.solution.cookie || resultResponse.data.solution.token;
                }

                if (resultResponse.data.status === 'failed') {
                    console.error(`   ❌ CapSolver failed: ${resultResponse.data.errorDescription}`);
                    return null;
                }

                // Show progress every 10 seconds
                if (attempt % 5 === 0 && attempt > 0) {
                    console.log(`   ⏳ Still waiting... (${(attempt + 1) * 2}s elapsed)`);
                }

                // Status is 'processing', continue polling
            }

            console.error(`   ❌ CapSolver timeout (${maxAttempts * 2} seconds)`);
            return null;

        } catch (error: any) {
            console.error(`   ❌ CapSolver API error: ${error.message}`);
            return null;
        }
    }

    /**
     * Detect and solve Cloudflare Turnstile CAPTCHA
     */
    async solveTurnstile(page: Page, maxRetries = 3): Promise<boolean> {
        if (!this.enabled) {
            console.log('   ℹ️ Turnstile solver disabled (no API key provided)');
            return true; // Skip if no API key
        }

        try {
            // Wait a moment for page to settle
            await page.waitForTimeout(1000);

            // Check for both DataDome and Cloudflare Turnstile challenges
            const challengeType = await page.evaluate(() => {
                // Check for DataDome first (more common on Etsy)
                const datadomeIframe = document.querySelector('iframe[src*="captcha-delivery.com"]');
                if (datadomeIframe) return 'datadome';

                const html = document.documentElement.outerHTML;
                if (html.includes('geo.captcha-delivery.com') || html.includes('dd={')) {
                    return 'datadome';
                }

                // Check for Cloudflare Turnstile
                const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
                if (turnstileIframe) return 'turnstile';

                const body = document.body.textContent || '';
                if (body.includes('Verification Required') && body.includes('Slide right to complete')) {
                    // Could be either - check domain
                    if (html.includes('captcha-delivery.com')) return 'datadome';
                    return 'turnstile';
                }

                const challenge = document.querySelector('.cf-challenge-container');
                if (challenge) return 'turnstile';

                return 'none';
            });

            if (challengeType === 'none') {
                console.log('   ✓ No CAPTCHA challenge detected');
                return true;
            }

            console.log(`   ⚠️ ${challengeType === 'datadome' ? 'DataDome' : 'Cloudflare Turnstile'} CAPTCHA detected - solving with CapSolver...`);

            // Extract sitekey from page
            const sitekey = await page.evaluate(() => {
                // Look for Turnstile widget
                const turnstileDiv = document.querySelector('[data-sitekey]');
                if (turnstileDiv) {
                    return turnstileDiv.getAttribute('data-sitekey');
                }

                // Alternative: check for cf-turnstile class
                const cfTurnstile = document.querySelector('.cf-turnstile');
                if (cfTurnstile) {
                    return cfTurnstile.getAttribute('data-sitekey');
                }

                // Check iframe src for sitekey parameter
                const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
                if (iframe) {
                    const src = iframe.getAttribute('src') || '';
                    const match = src.match(/sitekey=([^&]+)/);
                    if (match) return match[1];
                }

                // Check page source for Turnstile script
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const script of scripts) {
                    const text = script.textContent || '';
                    const match = text.match(/sitekey['"]?\s*[:=]\s*['"](0x[A-Za-z0-9_-]+)['"]/);
                    if (match) return match[1];
                }

                return null;
            });

            if (!sitekey) {
                console.error('   ❌ Could not find Turnstile sitekey on page');

                // Debug: Save page HTML to see what we're working with
                const html = await page.content();
                console.log('   📄 Page HTML preview (first 1000 chars):');
                console.log(html.substring(0, 1000));

                // Try to find ANY iframe
                const iframes = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('iframe')).map(iframe => ({
                        src: iframe.src,
                        id: iframe.id,
                        title: iframe.title
                    }));
                });
                console.log('   🔍 Found iframes:', JSON.stringify(iframes, null, 2));

                return false;
            }

            const pageUrl = page.url();
            console.log(`   🔑 Solving Turnstile (sitekey: ${sitekey.substring(0, 20)}...)`);

            // Solve using CapSolver API
            const token = await this.solveWithCapSolver(pageUrl, sitekey);

            if (!token) {
                console.error('   ❌ CapSolver failed to return solution');
                return false;
            }

            console.log('   ✅ Turnstile solved! Injecting token...');

            // Inject the solved token into the page
            await page.evaluate((token) => {
                // Find the Turnstile response input
                const input = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement;
                if (input) {
                    input.value = token;
                }

                // Also set the hidden input that Cloudflare checks
                const hiddenInput = document.querySelector('input[type="hidden"][name="cf-turnstile-response"]') as HTMLInputElement;
                if (hiddenInput) {
                    hiddenInput.value = token;
                }

                // Trigger Cloudflare's callback function if it exists
                if ((window as any).turnstile?.callback) {
                    (window as any).turnstile.callback(token);
                }

                // Trigger form submission or callback if exists
                const form = document.querySelector('form');
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            }, token);

            // Wait for Cloudflare to process the token
            await page.waitForTimeout(3000);

            // Check if we successfully bypassed (challenge frame should disappear)
            const stillBlocked = await page.locator('iframe[src*="challenges.cloudflare.com"]').count();

            if (stillBlocked > 0) {
                if (maxRetries > 0) {
                    console.log(`   ⚠️ Turnstile still present, retrying... (${maxRetries} attempts left)`);
                    await page.waitForTimeout(2000);
                    return this.solveTurnstile(page, maxRetries - 1);
                } else {
                    console.error('   ❌ Failed to bypass Turnstile after all retries');
                    return false;
                }
            }

            console.log('   ✅ Turnstile bypass successful!');
            return true;

        } catch (error: any) {
            console.error(`   ❌ Turnstile solver error: ${error.message}`);
            return false;
        }
    }

    /**
     * Wait for potential Turnstile challenge and solve it
     * Returns true if no challenge or challenge was solved successfully
     */
    async waitAndSolve(page: Page, timeout = 10000): Promise<boolean> {
        if (!this.enabled) {
            return true;
        }

        try {
            // Wait a moment to see if Turnstile appears
            await page.waitForTimeout(2000);

            // Check if Turnstile challenge frame exists
            const hasTurnstile = await page.locator('iframe[src*="challenges.cloudflare.com"]').count() > 0;

            if (!hasTurnstile) {
                return true; // No challenge, proceed normally
            }

            // Solve the challenge
            return await this.solveTurnstile(page);

        } catch (error: any) {
            // Timeout or other error - assume no challenge
            console.log('   ℹ️ No Turnstile challenge appeared within timeout');
            return true;
        }
    }
}
