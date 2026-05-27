import { Page, Frame } from 'rebrowser-playwright';

/**
 * Page verification handler
 * Handles page access verification challenges
 */

interface SolverResponse {
    errorId: number;
    errorCode?: string;
    errorDescription?: string;
    taskId?: string;
    status?: string;
    solution?: {
        distance?: number;
        slide_x_proportion?: number;
        cookie?: string;
    };
}

export class DataDomeSolver {
    private apiKey: string | null;
    private enabled: boolean;
    private createTaskUrl = 'https://api.capsolver.com/createTask';
    private getResultUrl = 'https://api.capsolver.com/getTaskResult';

    constructor(apiKey?: string) {
        this.apiKey = apiKey || null;
        this.enabled = !!apiKey && apiKey.length > 10;
    }

    async isBlocked(page: Page): Promise<boolean> {
        try {
            const result = await page.evaluate(() => {
                const iframe = document.querySelector('iframe[src*="captcha-delivery.com"]');
                const html = document.documentElement.outerHTML;
                return {
                    hasIframe: !!iframe,
                    hasGeo: html.includes('geo.captcha-delivery.com'),
                    hasDDObj: html.includes('dd={'),
                };
            });
            return result.hasIframe || result.hasGeo || result.hasDDObj;
        } catch (e: any) {
            return false;
        }
    }

    async solveDataDome(page: Page, _proxyInfo?: any, maxRetries = 3): Promise<boolean> {
        try {
            await page.waitForTimeout(2000);

            const isBlocked = await this.isBlocked(page);
            if (!isBlocked) {
                return true;
            }

            // Get the iframe
            const frame = await this.getDataDomeFrame(page);
            if (!frame) {
                return this.retry(page, _proxyInfo, maxRetries);
            }

            // Wait for content to load
            await frame.waitForTimeout(2000);

            // Check challenge type
            const challengeType = await this.detectChallengeType(frame);

            let solved = false;

            if (challengeType === 'simple') {
                solved = await this.solveSimpleSlider(frame);
            } else if (challengeType === 'puzzle') {
                if (this.enabled) {
                    solved = await this.solvePuzzleSlider(frame, page);
                } else {
                    solved = false;
                }
            } else {
                solved = await this.solveSimpleSlider(frame);
            }

            if (!solved) {
                return this.retry(page, _proxyInfo, maxRetries);
            }

            // Wait for verification
            const urlBefore = page.url();

            try {
                await page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' });
            } catch (e) {
                // No navigation happened
            }

            await page.waitForTimeout(2000);

            // Check if we're on the real site
            const pageContent = await page.evaluate(() => {
                const hasIframe = !!document.querySelector('iframe[src*="captcha-delivery.com"]');
                const hasSearchInput = !!document.querySelector('input[name="search_query"], input#global-enhancements-search-query');
                const hasEtsyNav = !!document.querySelector('[data-nav-main], .wt-action-group');
                return { hasIframe, hasSearchInput, hasEtsyNav };
            });

            if (pageContent.hasSearchInput || pageContent.hasEtsyNav) {
                return true;
            }

            // Check iframe for audio fallback
            try {
                const afterSlideInfo = await frame.evaluate(() => {
                    const bodyText = document.body?.innerText?.substring(0, 300) || '';
                    const hasAudioFallback = bodyText.includes('audio verification') || bodyText.includes('6 digits');
                    return { hasAudioFallback };
                });

                if (afterSlideInfo.hasAudioFallback) {
                    // Session flagged - don't retry
                    return false;
                }
            } catch (e: any) {
                // Frame closed, continue
            }

            // Check if still blocked
            const stillBlocked = await this.isBlocked(page);
            if (stillBlocked) {
                return this.retry(page, _proxyInfo, maxRetries);
            }

            return true;

        } catch (error: any) {
            return this.retry(page, _proxyInfo, maxRetries);
        }
    }

    private async retry(page: Page, proxyInfo: any, maxRetries: number): Promise<boolean> {
        if (maxRetries > 0) {
            await page.waitForTimeout(2000);
            return this.solveDataDome(page, proxyInfo, maxRetries - 1);
        }
        return false;
    }

    private async getDataDomeFrame(page: Page): Promise<Frame | null> {
        try {
            await page.waitForSelector('iframe[src*="captcha-delivery.com"]', { timeout: 10000 });
            const frames = page.frames();
            for (const frame of frames) {
                if (frame.url().includes('captcha-delivery.com')) {
                    return frame;
                }
            }
            const iframeEl = await page.$('iframe[src*="captcha-delivery.com"]');
            if (iframeEl) {
                return await iframeEl.contentFrame();
            }
            return null;
        } catch (e: any) {
            return null;
        }
    }

    private async detectChallengeType(frame: Frame): Promise<'simple' | 'puzzle' | 'unknown'> {
        const info = await frame.evaluate(() => {
            const canvases = document.querySelectorAll('#captcha__puzzle canvas');
            let hasCanvasContent = false;
            canvases.forEach((c: any) => {
                if (c.width > 0 && c.height > 50) {
                    hasCanvasContent = true;
                }
            });

            const slider = document.querySelector('.slider');
            const sliderTarget = document.querySelector('.sliderTarget');
            const sliderText = document.querySelector('.sliderText');

            const text = sliderText?.textContent || '';
            const isSimpleText = text.toLowerCase().includes('slide right to secure') ||
                                 text.toLowerCase().includes('slide to verify');

            return {
                hasCanvasContent,
                hasSlider: !!slider,
                hasSliderTarget: !!sliderTarget,
                isSimpleText,
            };
        });

        if (info.hasCanvasContent) {
            return 'puzzle';
        }

        if (info.hasSlider && !info.hasCanvasContent) {
            return 'simple';
        }

        if (info.isSimpleText) {
            return 'simple';
        }

        return 'unknown';
    }

    private async getIframeOffset(page: Page): Promise<{ x: number; y: number }> {
        try {
            const iframeEl = await page.$('iframe[src*="captcha-delivery.com"]');
            if (!iframeEl) {
                return { x: 0, y: 0 };
            }
            const box = await iframeEl.boundingBox();
            if (!box) {
                return { x: 0, y: 0 };
            }
            return { x: box.x, y: box.y };
        } catch (e) {
            return { x: 0, y: 0 };
        }
    }

    private async solveSimpleSlider(frame: Frame): Promise<boolean> {
        try {
            const page = frame.page();

            const iframeOffset = await this.getIframeOffset(page);

            const sliderInfo = await frame.evaluate(() => {
                const slider = document.querySelector('.slider');
                const sliderbg = document.querySelector('.sliderbg');
                const sliderTarget = document.querySelector('.sliderTarget');

                if (!slider || !sliderbg) {
                    return null;
                }

                const sliderRect = slider.getBoundingClientRect();
                const trackRect = sliderbg.getBoundingClientRect();
                const targetRect = sliderTarget?.getBoundingClientRect();

                return {
                    sliderX: sliderRect.x + sliderRect.width / 2,
                    sliderY: sliderRect.y + sliderRect.height / 2,
                    sliderWidth: sliderRect.width,
                    trackWidth: trackRect.width,
                    targetX: targetRect ? targetRect.x + targetRect.width / 2 : trackRect.x + trackRect.width - 10,
                    targetCenterFromTrackStart: targetRect ? (targetRect.x + targetRect.width / 2 - trackRect.x) : null,
                };
            });

            if (!sliderInfo) {
                return false;
            }

            const pageX = sliderInfo.sliderX + iframeOffset.x;
            const pageY = sliderInfo.sliderY + iframeOffset.y;

            let slideDistance: number;
            if (sliderInfo.targetCenterFromTrackStart !== null) {
                slideDistance = sliderInfo.targetX - sliderInfo.sliderX;
            } else {
                slideDistance = sliderInfo.trackWidth - sliderInfo.sliderWidth - 10;
            }

            await this.humanLikeSlide(page, pageX, pageY, slideDistance);

            return true;

        } catch (error: any) {
            return false;
        }
    }

    private async solvePuzzleSlider(frame: Frame, page: Page): Promise<boolean> {
        try {
            const iframeOffset = await this.getIframeOffset(page);

            const captchaData = await frame.evaluate(() => {
                const canvases = document.querySelectorAll('#captcha__puzzle canvas');
                let backgroundBase64 = '';
                let pieceBase64 = '';

                canvases.forEach((canvas: any, index) => {
                    if (canvas.width > 0 && canvas.height > 0) {
                        try {
                            const base64 = canvas.toDataURL('image/png').split(',')[1];
                            if (index === 0) backgroundBase64 = base64;
                            else if (index === 1) pieceBase64 = base64;
                        } catch (e) {}
                    }
                });

                const slider = document.querySelector('.slider');
                const sliderRect = slider?.getBoundingClientRect();

                return {
                    backgroundBase64,
                    pieceBase64: pieceBase64 || backgroundBase64,
                    sliderX: sliderRect?.x ?? 0,
                    sliderY: sliderRect?.y ?? 0,
                    sliderWidth: sliderRect?.width ?? 0,
                    sliderHeight: sliderRect?.height ?? 0,
                };
            });

            if (!captchaData.backgroundBase64) {
                return false;
            }

            const distance = await this.callVisionEngine(captchaData);
            if (!distance || distance <= 0) {
                return false;
            }

            const startX = captchaData.sliderX + captchaData.sliderWidth / 2 + iframeOffset.x;
            const startY = captchaData.sliderY + captchaData.sliderHeight / 2 + iframeOffset.y;

            await this.humanLikeSlide(page, startX, startY, distance);

            return true;

        } catch (error: any) {
            return false;
        }
    }

    private async callVisionEngine(captchaData: any): Promise<number | null> {
        if (!this.apiKey) return null;

        try {
            const response = await fetch(this.createTaskUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientKey: this.apiKey,
                    task: {
                        type: 'VisionEngine',
                        module: 'slider_1',
                        image: captchaData.pieceBase64,
                        imageBackground: captchaData.backgroundBase64,
                    },
                }),
            });

            const result: SolverResponse = await response.json();

            if (result.errorId !== 0) {
                return null;
            }

            if (result.solution) {
                return result.solution.distance ?? result.solution.slide_x_proportion ?? null;
            }

            if (result.taskId) {
                return await this.pollForResult(result.taskId);
            }

            return null;
        } catch (error: any) {
            return null;
        }
    }

    private async pollForResult(taskId: string): Promise<number | null> {
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const response = await fetch(this.getResultUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientKey: this.apiKey, taskId }),
                });
                const result: SolverResponse = await response.json();
                if (result.status === 'ready' && result.solution) {
                    return result.solution.distance ?? result.solution.slide_x_proportion ?? null;
                }
                if (result.status === 'failed') return null;
            } catch (e) {}
        }
        return null;
    }

    private async humanLikeSlide(page: Page, startX: number, startY: number, distance: number): Promise<void> {
        // Initial approach
        const approachX = startX - 50 - Math.random() * 100;
        const approachY = startY - 30 + Math.random() * 60;
        await page.mouse.move(approachX, approachY, { steps: 5 });
        await page.waitForTimeout(200 + Math.random() * 300);

        // Move to start position
        await page.mouse.move(startX, startY, { steps: 8 + Math.floor(Math.random() * 5) });
        await page.waitForTimeout(150 + Math.random() * 250);

        // Press mouse button
        await page.mouse.down();
        await page.waitForTimeout(80 + Math.random() * 120);

        // Slide with human-like movement
        const totalSteps = 25 + Math.floor(Math.random() * 20);
        const overshoot = 3 + Math.random() * 8;

        for (let i = 1; i <= totalSteps; i++) {
            const progress = i / totalSteps;

            let easeProgress: number;
            if (progress < 0.3) {
                easeProgress = 2 * progress * progress;
            } else if (progress < 0.85) {
                const normalized = (progress - 0.3) / 0.55;
                easeProgress = 0.18 + normalized * 0.75 + (Math.random() - 0.5) * 0.02;
            } else {
                const normalized = (progress - 0.85) / 0.15;
                const target = 0.93 + normalized * 0.07;
                easeProgress = target + (progress > 0.95 ? overshoot / distance : 0);
            }

            easeProgress = Math.min(1 + overshoot / distance, Math.max(0, easeProgress));

            const currentX = startX + distance * easeProgress;
            const wobbleMagnitude = 3 * (1 - progress * 0.7);
            const wobbleY = startY + (Math.random() - 0.5) * wobbleMagnitude;

            await page.mouse.move(currentX, wobbleY);

            let delay = 10 + Math.random() * 18;
            if (Math.random() < 0.1) {
                delay += 50 + Math.random() * 80;
            }
            await page.waitForTimeout(delay);
        }

        // Correct overshoot
        if (overshoot > 2) {
            await page.waitForTimeout(50 + Math.random() * 80);
            await page.mouse.move(startX + distance - 2, startY + (Math.random() - 0.5) * 2, { steps: 3 });
        }

        // Human pause before release
        await page.waitForTimeout(150 + Math.random() * 200);

        // Release
        await page.mouse.up();
    }

    setProxy(_proxyInfo: any) {}
}
