import { Actor } from 'apify';
import { PlaywrightCrawler, createPlaywrightRouter } from 'crawlee';
import { chromium } from 'rebrowser-playwright';
import { InputSchema, ValidatedInput, EtsyProduct } from './types.js';
import { HumanBehavior } from './human-behavior.js';
import { DataDomeSolver } from './datadome-solver.js';

/**
 * DataDome Bypass Strategy (Research-based):
 * 1. Use Crawlee's built-in fingerprinting (enabled by default)
 * 2. Residential proxies (MANDATORY - 25-30% of DataDome trust score)
 * 3. Session warmup (visit homepage, natural behavior)
 * 4. Continuous mouse movements via ghost-cursor
 * 5. Natural timing patterns (normal distribution, not uniform)
 * 6. Human-like scrolling and interactions
 */

class EtsyScraper {
    private input: ValidatedInput;
    private itemCount = 0;
    private seenProductIds = new Set<string>();
    private sessionWarmedUp = false;
    private dataDomeSolver: DataDomeSolver;

    constructor(input: ValidatedInput) {
        this.input = input;
        // Use environment variable only - never expose or log
        const apiKey = process.env.CAPSOLVER_API_KEY || '';
        this.dataDomeSolver = new DataDomeSolver(apiKey);
    }

    async run(): Promise<void> {
        const proxyConfiguration = await Actor.createProxyConfiguration({
            groups: ['RESIDENTIAL'],
            countryCode: 'US',
        });

        console.log(`🔗 Using US residential proxies\n`);

        const router = createPlaywrightRouter();

        // Handle search pages
        router.addHandler('SEARCH', async ({ page, request, crawler, proxyInfo }) => {
            const searchTargets = this.getSearchTargets();
            if (searchTargets.length === 0) {
                console.log('   ❌ No search query or searchUrl specified');
                throw new Error('No search query or searchUrl');
            }

            console.log(`📑 ${searchTargets.length} search target(s), up to ${this.input.maxPages} page(s) each\n`);

            // Wait for homepage to load
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            } catch (e) {
                console.log('   ⚠️ Page load timeout');
            }

            // Save homepage HTML for debugging
            const homepageHtml = await page.content();
            await Actor.setValue('homepage.html', homepageHtml, { contentType: 'text/html' });
            console.log(`   📄 Homepage loaded, HTML saved (${homepageHtml.length} chars)`);

            // Check if we got blocked on homepage
            let isBlocked = await this.dataDomeSolver.isBlocked(page);
            if (isBlocked) {
                console.log('   ⚠️ Challenge detected on homepage');
                const solved = await this.dataDomeSolver.solveDataDome(page, proxyInfo);
                if (!solved) {
                    throw new Error('Homepage blocked');
                }
                await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            }

            // Initialize human behavior and simulate browsing
            const humanBehavior = new HumanBehavior(page);
            await humanBehavior.initialize();

            const lightHomepage = this.input.maxPages > 1;
            console.log(`   🔥 Simulating human behavior on homepage${lightHomepage ? ' (light)' : ''}...`);
            await this.naturalDelay(lightHomepage ? 1000 : 2000, lightHomepage ? 1500 : 3000);
            await humanBehavior.naturalScroll(lightHomepage ? 1 : 2);
            await humanBehavior.randomMouseMovements(lightHomepage ? 1 : 3);
            await this.naturalDelay(lightHomepage ? 500 : 1000, lightHomepage ? 1000 : 2000);

            let querySearchDone = false;

            for (let targetIndex = 0; targetIndex < searchTargets.length; targetIndex++) {
                if (this.itemCount >= this.input.maxItems) break;

                const target = searchTargets[targetIndex];
                let baseSearchUrl: string;

                if (target.type === 'url') {
                    console.log(`\n🔗 Search ${targetIndex + 1}/${searchTargets.length}: ${target.url}`);
                    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await this.naturalDelay(2000, 3000);
                    baseSearchUrl = target.url;
                } else {
                    if (querySearchDone) continue;
                    console.log(`\n🔍 Search by query: "${target.query}"`);
                    await this.submitQuerySearch(page, target.query);
                    querySearchDone = true;
                    baseSearchUrl = page.url();
                }

                await this.scrapeSearchResultPages(page, humanBehavior, proxyInfo, baseSearchUrl, targetIndex);
            }
        });

        // Handle product pages (Direct access or if configured)
        router.addHandler('PRODUCT', async ({ page, request, proxyInfo }) => {
            console.log(`📦 Scraping product: ${request.url}`);

            // Initialize human behavior
            const humanBehavior = new HumanBehavior(page);
            await humanBehavior.initialize();

            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
                await this.naturalDelay(1000, 2000);
            } catch (e) {
                console.log('   ⚠️ Timeout waiting for page load');
            }

            // Basic anti-bot movements
            await humanBehavior.naturalScroll(2);

            // Check for blocking
            const isBlocked = await this.dataDomeSolver.isBlocked(page);
            if (isBlocked) {
                const solved = await this.dataDomeSolver.solveDataDome(page, proxyInfo);
                if (!solved) {
                    throw new Error('Page blocked');
                }
                await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            }

            const product = await page.evaluate(() => {
                try {
                    // Basic Info
                    const title = document.querySelector('h1')?.textContent?.trim() || '';
                    const productId = window.location.href.match(/\/listing\/(\d+)/)?.[1] || '';
                    
                    // Price
                    let price = 0;
                    const priceEl = document.querySelector('[data-selector="price-only"]') || 
                                   document.querySelector('.wt-text-title-03') ||
                                   document.querySelector('[class*="price"]');
                    if (priceEl) {
                        const match = priceEl.textContent?.match(/[\d,]+\.?\d*/);
                        if (match) price = parseFloat(match[0].replace(/,/g, ''));
                    }

                    // Shop Name - USING USER'S SELECTOR as primary method
                    // Selector: #product_details_content_toggle > div > div:nth-child(1) > ul > div > li > div.wt-ml-xs-1.how-its-made-label-product-details > a
                    let shopName = '';
                    let shopUrl = '';
                    
                    // User provided selector (xpath style adapted to CSS)
                    const userSelector = '#product_details_content_toggle > div > div:nth-child(1) > ul > div > li > div.wt-ml-xs-1.how-its-made-label-product-details > a';
                    const userShopEl = document.querySelector(userSelector);
                    
                    if (userShopEl) {
                        shopName = userShopEl.textContent?.trim() || '';
                        shopUrl = userShopEl.getAttribute('href') || '';
                    }
                    
                    // Fallback selectors for shop name
                    if (!shopName) {
                        const shopHeader = document.querySelector('a[href*="/shop/"]');
                        if (shopHeader) {
                            shopName = shopHeader.textContent?.trim() || '';
                            shopUrl = shopHeader.getAttribute('href') || '';
                        }
                    }

                    // Rating & Reviews
                    let rating = 0;
                    let reviewCount = 0;
                    const reviewsBadge = document.querySelector('#reviews-link') || document.querySelector('a[href="#reviews"]');
                    if (reviewsBadge) {
                         const text = reviewsBadge.textContent || '';
                         const countMatch = text.match(/(\d+)/);
                         if (countMatch) reviewCount = parseInt(countMatch[1]);
                         
                         // Try to find rating stars near reviews
                         const stars = document.querySelector('input[name="rating"]');
                         if (stars) rating = parseFloat(stars.getAttribute('value') || '0');
                    }

                    const imageUrl = document.querySelector('img.wt-image')?.getAttribute('src') || '';

                    if (shopUrl && !shopUrl.startsWith('http')) {
                        shopUrl = `https://www.etsy.com${shopUrl}`;
                    }

                    return {
                        productId,
                        title,
                        url: window.location.href,
                        price,
                        rating,
                        reviewCount,
                        shopName: shopName || 'N/A',
                        shopUrl: shopUrl || '',
                        imageUrl,
                        scrapedAt: new Date().toISOString(),
                    } as EtsyProduct;
                } catch (e) {
                    return null;
                }
            });

            if (product && product.title) {
                console.log(`   ✅ "${product.title.substring(0, 50)}..." | Shop: ${product.shopName}`);
                await this.pushProduct(product);
                this.itemCount++;
            } else {
                console.log('   ❌ Failed to extract product details');
            }
        });

        // Homepage + DataDome + N pages with human delays can exceed 120s (see maxPages)
        // ~30–45s per page with light pagination; cap at 1 hour for large maxPages (e.g. 30)
        const requestHandlerTimeoutSecs = Math.min(3600, 120 + this.input.maxPages * 55);

        const crawler = new PlaywrightCrawler({
            proxyConfiguration,
            requestHandlerTimeoutSecs,
            useSessionPool: true,
            persistCookiesPerSession: true,
            requestHandler: router,

            // CRITICAL: Rate limiting to avoid DataDome detection on product pages
            // Product pages get detected when navigating too fast
            minConcurrency: 1,
            maxConcurrency: 1, // Force sequential processing (ignore input)
            maxRequestsPerMinute: 12, // ~5 seconds between requests

            // DISABLE Crawlee's fingerprinting - let rebrowser-playwright handle it
            // Crawlee's fingerprint injection can interfere with rebrowser's CDP patches
            browserPoolOptions: {
                useFingerprints: false,
            },

            sessionPoolOptions: {
                blockedStatusCodes: [], // DataDome uses 403s, don't mark as blocked
                maxPoolSize: 10,
            },

            launchContext: {
                // CRITICAL: Use rebrowser-playwright for CDP detection evasion
                // This patches Chrome DevTools Protocol which DataDome monitors
                launcher: chromium,
                launchOptions: {
                    headless: false, // IMPORTANT: headless mode has different fingerprints
                },
            },

            preNavigationHooks: [
                async ({ request, page }, gotoOptions) => {
                    // NOTE: rebrowser-playwright handles CDP detection
                    // Don't inject manual anti-detection scripts - they can interfere

                    // Set realistic viewport (common desktop resolution)
                    await page.setViewportSize({
                        width: 1920,
                        height: 1080
                    });

                    // BLOCKING: Reduce bandwidth by blocking unnecessary resources
                    await page.route('**/*', (route: any) => {
                        const request = route.request();
                        const resourceType = request.resourceType();
                        const url = request.url();

                        // Block heavy resources (NOT stylesheets - blocking CSS is a detection vector)
                        if (['image', 'media', 'font'].includes(resourceType)) {
                            return route.abort();
                        }

                        // Block specific analytics and tracking scripts (optional but good for speed)
                        if (url.includes('google-analytics') || url.includes('facebook.net') || url.includes('doubleclick')) {
                            return route.abort();
                        }

                        // Continue all other requests
                        return route.continue();
                    });

                    gotoOptions.waitUntil = 'domcontentloaded';
                    gotoOptions.timeout = 60000;
                },
            ],
        });

        const startUrls = this.generateStartUrls();
        console.log(`🚀 Starting scraper with ${startUrls.length} URLs (handler timeout: ${requestHandlerTimeoutSecs}s)\n`);

        await crawler.run(startUrls.map(url => {
            // Determine label based on URL type
            let label = 'SEARCH';
            if (url.includes('/listing/')) {
                label = 'PRODUCT';
            } else if (url.includes('/shop/')) {
                label = 'SHOP';
            } else if (url.includes('/c/')) {
                label = 'CATEGORY';
            }
            return { url, label };
        }));

        console.log(`\n✅ Complete! Scraped ${this.itemCount} products`);
    }

    private getSearchTargets(): Array<{ type: 'url'; url: string } | { type: 'query'; query: string }> {
        const targets: Array<{ type: 'url'; url: string } | { type: 'query'; query: string }> = [];

        const urlList = this.input.searchUrls?.filter((u) => u?.trim()) ?? [];
        if (urlList.length > 0) {
            for (const raw of urlList) {
                targets.push({ type: 'url', url: this.normalizeEtsySearchUrl(raw.trim()) });
            }
        } else if (this.input.searchUrl?.trim()) {
            targets.push({ type: 'url', url: this.normalizeEtsySearchUrl(this.input.searchUrl.trim()) });
        }

        if (targets.length === 0 && this.input.query?.trim()) {
            targets.push({ type: 'query', query: this.input.query.trim() });
        }

        return targets;
    }

    private buildSearchPageUrl(baseUrl: string, pageNumber: number): string {
        const url = new URL(baseUrl);
        url.searchParams.set('page', String(pageNumber));
        return url.toString();
    }

    private async resolveDataDomeBlock(page: any, proxyInfo: any, context: string): Promise<void> {
        const isBlocked = await this.dataDomeSolver.isBlocked(page);
        if (!isBlocked) return;

        console.log(`   ⚠️ Challenge detected on ${context}`);
        const solved = await this.dataDomeSolver.solveDataDome(page, proxyInfo);
        if (!solved) {
            throw new Error(`${context} blocked`);
        }
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    }

    private async submitQuerySearch(page: any, searchQuery: string): Promise<void> {
        console.log('   📝 Looking for search input...');
        const searchSelectors = [
            'input#global-enhancements-search-query',
            'input[name="search_query"]',
            'input[placeholder*="Search"]',
            'input[type="search"]',
            '#search-query',
            '.wt-input-btn-group input',
        ];

        let searchInput = null;
        for (const selector of searchSelectors) {
            searchInput = await page.$(selector);
            if (searchInput) {
                const isVisible = await searchInput.isVisible().catch(() => false);
                if (isVisible) {
                    console.log(`   ✅ Found search input: ${selector}`);
                    break;
                }
            }
            searchInput = null;
        }

        if (!searchInput) {
            const inputs = await page.$$eval('input', (els: any[]) =>
                els.map((el: any) => ({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder }))
            );
            console.log('   Available inputs:', JSON.stringify(inputs.slice(0, 10)));
            throw new Error('Search input not found');
        }

        await searchInput.click();
        await this.naturalDelay(300, 600);

        console.log(`   ⌨️ Typing: "${searchQuery}"`);
        for (const char of searchQuery) {
            await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
        }
        await this.naturalDelay(500, 1000);

        console.log('   ⏎ Pressing Enter...');
        await page.keyboard.press('Enter');

        try {
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            await this.naturalDelay(2000, 3000);
        } catch (e) {
            console.log('   ⚠️ Timeout waiting for search results');
        }
    }

    private async scrapeSearchResultPages(
        page: any,
        humanBehavior: HumanBehavior,
        proxyInfo: any,
        baseSearchUrl: string,
        targetIndex: number,
    ): Promise<void> {
        const maxPages = this.input.maxPages;

        for (let pageNum = 1; pageNum <= maxPages && this.itemCount < this.input.maxItems; pageNum++) {
            if (page.isClosed()) {
                console.log('   ⚠️ Browser page closed, stopping pagination');
                break;
            }

            if (pageNum > 1) {
                const nextUrl = this.buildSearchPageUrl(baseSearchUrl, pageNum);
                console.log(`   📄 Opening page ${pageNum}: ${nextUrl}`);
                await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await this.naturalDelay(1000, 1500);
            }

            // First results page: fuller simulation; later pages: faster to avoid handler timeout
            if (pageNum === 1) {
                await humanBehavior.naturalScroll(2);
                await humanBehavior.randomMouseMovements(2);
                await this.naturalDelay(1000, 2000);
            } else {
                await humanBehavior.naturalScroll(1);
                await this.naturalDelay(500, 1000);
            }
            await this.resolveDataDomeBlock(page, proxyInfo, `search results page ${pageNum}`);

            const pageTitle = await page.title();
            const listingCount = await page.$$eval('[data-palette-listing-id]', (els: any[]) => els.length);
            console.log(`   📄 "${pageTitle}" | ${listingCount} listing elements on page ${pageNum}`);

            if (pageNum === 1 && targetIndex === 0) {
                const html = await page.content();
                await Actor.setValue('search-results.html', html, { contentType: 'text/html' });
            }

            const products = await this.extractProductsFromSearchPage(page);
            console.log(`   📋 Extracted ${products.length} products from page ${pageNum}`);

            const saved = await this.saveSearchProducts(products);
            console.log(`   💾 Saved ${saved} new product(s) (total: ${this.itemCount})`);

            if (products.length === 0 && listingCount > 0) {
                console.log(`   ⏭️ No "Popular now" items on page ${pageNum} (${listingCount} listings), continuing...`);
            }

            // Only stop when Etsy returns no result cards (end of search), not when Popular now filter matches nothing
            if (listingCount === 0) {
                console.log('   ⏹️ Empty search results page, stopping pagination');
                break;
            }
        }
    }

    private async extractProductsFromSearchPage(page: any): Promise<EtsyProduct[]> {
        return page.evaluate(() => {
                const items: any[] = [];
                const jsonLdMap: Record<string, string> = {};

                // Try to parse JSON-LD for robust shop name extraction
                try {
                    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                    scripts.forEach(script => {
                        try {
                            const data = JSON.parse(script.textContent || '{}');
                            if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
                                data.itemListElement.forEach((item: any) => {
                                    const product = item.item;
                                    if (product && product.url && product.brand && product.brand.name) {
                                        // Map by full URL
                                        jsonLdMap[product.url] = product.brand.name;
                                        
                                        // Map by ID
                                        const idMatch = product.url.match(/\/listing\/(\d+)/);
                                        if (idMatch) {
                                            jsonLdMap[idMatch[1]] = product.brand.name;
                                        }
                                    }
                                });
                            }
                        } catch (e) {
                            // Ignore parse errors for individual scripts
                        }
                    });
                } catch (e) {
                    console.error('Error parsing JSON-LD:', e);
                }

                // Find all product listing elements
                const listings = document.querySelectorAll('[data-palette-listing-id]');

                listings.forEach((listing: any) => {
                    const popularNowSignal = listing.querySelector('clg-signal');
                     if (!popularNowSignal) return;
                     const signalText = popularNowSignal.textContent?.trim().toLowerCase();
                    if (signalText !== 'popular now') return;
                    try {
                        // Product link and ID
                        const link = listing.querySelector('a[href*="/listing/"]');
                        if (!link) return;

                        const href = link.getAttribute('href') || '';
                        const productId = href.match(/\/listing\/(\d+)/)?.[1] || '';
                        const url = href.startsWith('http') ? href : `https://www.etsy.com${href}`;

                        // Title - try multiple selectors
                        const titleEl = listing.querySelector('h3') ||
                                       listing.querySelector('[data-listing-card-title]') ||
                                       listing.querySelector('h2');
                        const title = titleEl?.textContent?.trim() || '';

                        // Price - look for price elements
                        let price = 0;
                        const priceContainer = listing.querySelector('[data-selector="listing-price"]') ||
                                              listing.querySelector('[class*="currency-value"]') ||
                                              listing.querySelector('span[class*="price"]');

                        if (priceContainer) {
                            const priceText = priceContainer.textContent || '';
                            const match = priceText.match(/[\d,]+\.?\d*/);
                            if (match) {
                                price = parseFloat(match[0].replace(/,/g, ''));
                            }
                        }

                        // Review count - look in aria-label or text (declare first)
                        let reviewCount = 0;
                        const reviewEl = listing.querySelector('[aria-label*="star"]') ||
                                        listing.querySelector('[data-reviews-count]');

                        if (reviewEl) {
                            const reviewText = reviewEl.getAttribute('aria-label') || reviewEl.textContent || '';
                            const match = reviewText.match(/(\d+(?:,\d+)?)\s*(?:reviews?|stars?)/i);
                            if (match) {
                                reviewCount = parseInt(match[1].replace(/,/g, ''));
                            }
                        }

                        // Rating - stars value (extract AFTER reviewCount)
                        let rating = 0;

                        // Method 1: data-rating attribute
                        const ratingEl = listing.querySelector('[data-rating]');
                        if (ratingEl) {
                            const ratingValue = ratingEl.getAttribute('data-rating');
                            rating = parseFloat(ratingValue || '0');
                        }

                        // Method 2: Look for star rating in aria-label (often has format "4.8 out of 5 stars")
                        if (rating === 0 && reviewEl) {
                            const ariaLabel = reviewEl.getAttribute('aria-label') || '';
                            const match = ariaLabel.match(/([\d.]+)\s*out of 5/i) || ariaLabel.match(/([\d.]+)\s*stars?/i);
                            if (match) {
                                rating = parseFloat(match[1]);
                            }
                        }

                        // Method 3: Sometimes ratings appear as text like "4.8 (123)"
                        if (rating === 0 && reviewCount > 0) {
                            const textEls = listing.querySelectorAll('span, p, div');
                            for (const el of textEls) {
                                const text = el.textContent || '';
                                const match = text.match(/([\d.]+)\s*\(\s*\d+\s*\)/);
                                if (match) {
                                    const potentialRating = parseFloat(match[1]);
                                    if (potentialRating >= 0 && potentialRating <= 5) {
                                        rating = potentialRating;
                                        break;
                                    }
                                }
                            }
                        }

                        // Shop name and URL - try multiple approaches
                        let shopName = '';
                        let shopUrl = '';

                        // STRATEGY 1: Check JSON-LD map (Most reliable)
                        if (productId && jsonLdMap[productId]) {
                            shopName = jsonLdMap[productId];
                        } else if (url && jsonLdMap[url]) {
                            shopName = jsonLdMap[url];
                        }

                        // STRATEGY 2: Try finding shop link
                        if (!shopName) {
                            const shopLink = listing.querySelector('a[href*="/shop/"]');
                            if (shopLink) {
                                shopName = shopLink.textContent?.trim() || '';
                                const shopHref = shopLink.getAttribute('href') || '';
                                shopUrl = shopHref ? (shopHref.startsWith('http') ? shopHref : `https://www.etsy.com${shopHref}`) : '';
                            }
                        }

                        // STRATEGY 3: Try finding "From shop X" text (Screen Reader text)
                        // Found in HTML: <span class="... wt-screen-reader-only">From shop ToddAlcottGraphics</span>
                        if (!shopName) {
                            const screenReaderSpans = listing.querySelectorAll('span[class*="screen-reader-only"], span.wt-screen-reader-only');
                            for (const span of screenReaderSpans) {
                                const text = span.textContent || '';
                                const match = text.match(/From shop\s+(.+)/i);
                                if (match) {
                                    shopName = match[1].trim();
                                    break;
                                }
                            }
                        }

                        // STRATEGY 4: Data attributes
                        if (!shopName) {
                            const shopNameEl = listing.querySelector('[data-shop-name]');
                            if (shopNameEl) {
                                shopName = shopNameEl.getAttribute('data-shop-name') || shopNameEl.textContent?.trim() || '';
                            }
                        }

                        // STRATEGY 5: Generic link check
                        if (!shopName) {
                            const allLinks = listing.querySelectorAll('a');
                            for (const link of allLinks) {
                                const href = link.getAttribute('href') || '';
                                if (href.includes('/shop/')) {
                                    shopName = link.textContent?.trim() || '';
                                    shopUrl = href.startsWith('http') ? href : `https://www.etsy.com${href}`;
                                    break;
                                }
                            }
                        }

                        // Construct Shop URL if we have name but no URL
                        if (shopName && !shopUrl) {
                            shopUrl = `https://www.etsy.com/shop/${shopName.replace(/\s+/g, '')}`;
                        }

                        // Image - try to get highest quality
                        const imgEl = listing.querySelector('img');
                        let imageUrl = '';
                        if (imgEl) {
                            imageUrl = imgEl.getAttribute('src') ||
                                      imgEl.getAttribute('data-src') ||
                                      imgEl.getAttribute('data-lazy-src') || '';
                        }

                        if (productId && title) {
                            items.push({
                                productId,
                                title,
                                url,
                                price,
                                rating,
                                reviewCount,
                                shopName: shopName || 'N/A', // Mark explicitly if not found
                                shopUrl: shopUrl || '',
                                imageUrl,
                                scrapedAt: new Date().toISOString(),
                            });
                        }
                    } catch (e) {
                        // Skip invalid items
                        console.error('Error extracting product:', e);
                    }
                });

                return items;
        });
    }

    private async saveSearchProducts(products: EtsyProduct[]): Promise<number> {
        let saved = 0;
        const remaining = this.input.maxItems - this.itemCount;

        for (const product of products) {
            if (saved >= remaining) break;
            if (this.seenProductIds.has(product.productId)) continue;
            if (!this.passesFilters(product)) {
                console.log(`   ⏭️ Filtered out: ${product.title.substring(0, 30)}`);
                continue;
            }
            this.seenProductIds.add(product.productId);
            console.log(`   ✅ "${product.title.substring(0, 50)}..." | $${product.price} | ⭐${product.rating}`);
            await this.pushProduct(product);
            this.itemCount++;
            saved++;
        }

        return saved;
    }

    /**
     * Validates and normalizes an Etsy search URL so query params (filters, sort, etc.) are kept.
     */
    private normalizeEtsySearchUrl(raw: string): string {
        let parsed: URL;
        try {
            parsed = new URL(raw);
        } catch {
            throw new Error(`Invalid searchUrl: ${raw}`);
        }

        if (!parsed.hostname.includes('etsy.com')) {
            throw new Error('searchUrl must be an etsy.com URL');
        }

        if (!parsed.pathname.includes('/search')) {
            throw new Error('searchUrl must point to an Etsy search page (path contains /search)');
        }

        return parsed.toString();
    }

    private generateStartUrls(): string[] {
        const urls: string[] = [];

        // Warm up on homepage first, then navigate to searchUrl or type query
        if (this.input.query || this.input.searchUrl || (this.input.searchUrls?.length ?? 0) > 0) {
            urls.push('https://www.etsy.com');
        }

        if (this.input.categoryUrl) urls.push(this.input.categoryUrl);
        if (this.input.shopUrl) urls.push(this.input.shopUrl);
        if (this.input.productUrls) urls.push(...this.input.productUrls);

        // Default to homepage if nothing specified
        if (urls.length === 0) {
            urls.push('https://www.etsy.com');
        }

        return urls;
    }

    /**
     * Session warmup - CRITICAL for DataDome bypass
     * Simulates real user visiting Etsy for first time
     */
    private async warmupSession(page: any): Promise<void> {
        console.log('🔥 Warming up session (anti-DataDome strategy)...');

        try {
            // Visit homepage first (real users don't land directly on search)
            await page.goto('https://www.etsy.com', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Initialize human behavior
            const humanBehavior = new HumanBehavior(page);
            await humanBehavior.initialize();

            // Natural delay (reading homepage)
            await this.naturalDelay(2000, 3000);

            // Simulate browsing behavior
            await humanBehavior.naturalScroll(3); // Scroll down to see content
            await humanBehavior.randomMouseMovements(4); // Move mouse around
            await humanBehavior.readPageContent(4000); // Simulate reading

            console.log('   ✅ Session warmed up successfully');
        } catch (error: any) {
            console.log(`   ⚠️ Session warmup failed: ${error.message}`);
            // Continue anyway - warmup is best effort
        }
    }

    /**
     * Natural delay with normal distribution (not uniform)
     * Mimics human reaction time variability
     */
    private async naturalDelay(minMs: number, maxMs: number): Promise<void> {
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

    private passesFilters(product: EtsyProduct): boolean {
        if (this.input.minRating && product.rating < this.input.minRating) return false;
        if (this.input.minReviews && product.reviewCount < this.input.minReviews) return false;
        if (this.input.priceMin && product.price < this.input.priceMin) return false;
        if (this.input.priceMax && product.price > this.input.priceMax) return false;
        return true;
    }

    private async pushProduct(product: EtsyProduct): Promise<void> {
        try {
            await Actor.pushData(product, 'product-scraped');
        } catch (error: any) {
            if (error.message?.includes('price')) {
                await Actor.pushData(product);
            } else {
                throw error;
            }
        }
    }
}

Actor.main(async () => {
    console.log('🚀 Starting Etsy Scraper Pro...\n');

    const rawInput = await Actor.getInput();
    let input: ValidatedInput;

    try {
        input = InputSchema.parse(rawInput || {});
    } catch (error: any) {
        console.error('❌ Invalid input:', error.message);
        throw new Error(`Invalid input: ${error.message}`);
    }

    const scraper = new EtsyScraper(input);
    await scraper.run();

    console.log('\n🎉 Actor finished successfully!');
});
