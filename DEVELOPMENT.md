# Etsy Scraper Pro - Development Guide

## Project Overview

**Status:** ✅ MVP Complete (Phase 1)
**Development Time:** ~6 hours
**Next Steps:** Testing, deployment, marketing

## Architecture

### Tech Stack
- **Runtime:** Node.js 20 + TypeScript
- **Browser Automation:** Playwright + playwright-extra
- **Anti-Detection:** puppeteer-extra-plugin-stealth
- **Crawler:** Crawlee (Apify)
- **Validation:** Zod
- **Container:** Docker (apify/actor-node-playwright-chrome:20)

### Key Files

```
etsy-scraper-pro/
├── .actor/
│   ├── actor.json              # Actor metadata & storefront config
│   ├── INPUT_SCHEMA.json       # User input validation
│   └── DATASET_SCHEMA.json     # Output dataset with 6 views
├── src/
│   ├── main.ts                 # Main actor logic & orchestration
│   ├── scraper.ts              # Scraping functions (product, reviews, shop)
│   └── types.ts                # TypeScript interfaces
├── dist/                       # Compiled JavaScript (build output)
├── Dockerfile                  # Playwright-enabled container
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript config
├── INPUT.json                  # Test input (local development)
└── README.md                   # User documentation
```

## Features Implemented (Phase 1 - MVP)

### ✅ Product Scraping
- JSON-LD parser (primary, most reliable)
- HTML selector fallback
- Complete product details (title, description, price, images)
- Ratings, reviews, favorites
- Categories, tags, materials
- Variations (size, color, etc.)
- Shipping info

### ✅ Review Scraping
- Paginated extraction (configurable max)
- Rating, text, reviewer details
- Review photos
- Verified purchase indicator
- Helpful count
- Variation purchased

### ✅ Shop Scraping
- Shop statistics (sales, rating, location)
- Total listings & favorites
- Owner info, joined date
- Shop policies (returns, shipping, payment)
- Social media links
- Top categories

### ✅ Search Modes
- Keyword search (`query`)
- Direct search URL (`searchUrl`)
- Category URL (`categoryUrl`)
- Shop URL (`shopUrl`)
- Direct product URLs (`productUrls`)

### ✅ Advanced Filters
- Minimum rating (e.g., 4+ stars only)
- Minimum review count
- Price range (min/max)
- On sale filter

### ✅ Anti-Bot Protection
- Playwright + Stealth plugins (bypass Cloudflare)
- Residential proxies (required - datacenter IPs blocked)
- Session management (cookie persistence)
- Human-like behavior (random delays)

### ✅ Infrastructure
- pay-per-event billing ($0.002/product)
- Graceful error handling (continues on failures)
- Input validation (Zod schema)
- 6 dataset views (overview, top_rated, best_sellers, on_sale, shops, products_detailed)
- Comprehensive documentation (README)

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally (requires Apify token for proxies)
npm run dev

# Type check
npm run type-check

# Deploy to Apify
npm run push
```

## Local Testing

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Apify API token to `.env`:
   ```
   APIFY_TOKEN=apify_api_xxxxxxxxxxxxx
   ```

3. Edit `INPUT.json` with test parameters

4. Run locally:
   ```bash
   npm run dev
   ```

**Note:** Residential proxies are REQUIRED. Without an Apify token, the actor will fail due to Cloudflare protection.

## Testing Checklist

Before deployment, test these scenarios:

### Basic Functionality
- [ ] Search by keyword ("handmade leather wallet")
- [ ] Search with filters (minRating, priceMin/Max)
- [ ] Direct product URLs (3-5 URLs)
- [ ] Shop URL scraping
- [ ] Category URL scraping

### Data Quality
- [ ] All required fields present (productId, title, url, price, currency)
- [ ] Images array populated
- [ ] Reviews scraped correctly (if includeReviews: true)
- [ ] Shop details accurate (if includeShopDetails: true)
- [ ] No null values in non-nullable fields

### Error Handling
- [ ] Invalid search query (returns empty results, no crash)
- [ ] Product page 404 (gracefully skips, continues)
- [ ] Cloudflare challenge (bypassed with stealth + proxies)
- [ ] Rate limiting (retries with exponential backoff)

### Performance
- [ ] 50 products in <5 minutes (with reviews)
- [ ] 100 products in <10 minutes (without reviews)
- [ ] 95%+ success rate with residential proxies
- [ ] No memory leaks (check with 1000+ products)

### Dataset Views
- [ ] "overview" view shows key metrics
- [ ] "top_rated" view filters correctly (10+ reviews)
- [ ] "best_sellers" view filters correctly (100+ shop sales)
- [ ] "on_sale" view shows only discounted products
- [ ] "shops" view aggregates shop data
- [ ] "products_detailed" view shows complete info

## Deployment Steps

1. **Build project:**
   ```bash
   npm run build
   ```

2. **Test locally with real Etsy data:**
   ```bash
   npm run dev
   # Review results in storage/datasets/default/
   ```

3. **Deploy to Apify:**
   ```bash
   apify login
   apify push
   ```

4. **Configure monetization in Apify Console:**
   - Go to Actor → Monetization tab
   - Select "Pay per event" model
   - Configure event pricing:
     - Event name: `product-scraped`
     - Title: "Product Scraped"
     - Description: "Successfully scraped product data"
     - Price: $0.002 USD per event

5. **Test on Apify platform:**
   - Run with 10 products
   - Check dataset output
   - Verify pay-per-event billing triggered
   - Check charging-log dataset (if ACTOR_TEST_PAY_PER_EVENT=true)

6. **Publish to Apify Store:**
   - Update storefront description
   - Add screenshots/video demo
   - Set SEO keywords
   - Set appropriate categories (ECOMMERCE, TOOLS)
   - Mark as "public"

## Known Issues & Limitations

### Selector Reliability
**Issue:** Etsy may change HTML structure, breaking selectors
**Mitigation:** JSON-LD parser is primary method (more stable)
**TODO:** Add monitoring to detect when selectors break

### Residential Proxy Cost
**Issue:** Residential proxies cost ~$2-5 per GB
**Mitigation:** Optimized to minimize data transfer
**Note:** Essential for reliability - datacenter IPs blocked 100%

### Review Pagination
**Issue:** Large review counts (>1000) take time to scrape
**Mitigation:** `maxReviewsPerProduct` parameter (default: 10)
**TODO:** Implement smart sampling (first/last reviews only)

### Shop Details Accuracy
**Issue:** Some shop fields may be missing/stale
**Mitigation:** Graceful fallbacks to empty strings
**TODO:** Add data freshness indicator

## Phase 2 Features (Coming Soon)

### Sales Estimator
**Goal:** Predict 30-day sales from review velocity
**Algorithm:** `reviews_30d * 10 + favorites_30d * 2`
**Implementation:** Track review dates, calculate velocity
**Accuracy Target:** ±20% of actual sales

### Trending Score
**Goal:** Identify rising products (0-100 scale)
**Metrics:** Review velocity, favorite growth, price changes
**Use Case:** Find viral products before they peak

### Competition Analysis
**Goal:** Market intelligence metrics
**Features:**
- Price percentile within category
- Saturation index (# similar products)
- Market leader identification

### Keyword Intelligence
**Goal:** Top-performing keywords per category
**Features:**
- Keyword frequency analysis
- Search volume estimates
- Competition difficulty score

### Scheduled Monitoring
**Goal:** Track products/shops over time
**Features:**
- State management (last run, processed IDs)
- Price change detection
- Review sentiment tracking
- Inventory level changes

### Webhook Support
**Goal:** Real-time alerts for automation workflows
**Triggers:**
- Price drops (> threshold %)
- New products from shops
- Review sentiment changes
- Competitor activity

**Target Launch:** Q1 2026
**Development Time:** ~34 hours

## Marketing Strategy

### Phase 1: Capture Deprecated Users (Week 1-2)

**Target:** 2,825 users of epctex/etsy-scraper (deprecated)

**Tactics:**
1. Apify Store listing:
   - Title: "Etsy Scraper Pro - Sales Estimator & Trend Analysis"
   - Description: "The ONLY maintained Etsy scraper..."
   - Highlight: Free tier (500 products/month)

2. Apify Discord/Forum:
   - Post: "epctex Etsy scraper deprecated - here's the replacement"
   - Offer migration guide
   - 1-month free Pro tier for early adopters

**Goal:** 83 MAU (50% of existing market)

### Phase 2: Etsy Seller Communities (Week 3-8)

**Channels:**
1. Reddit (r/EtsySellers, r/dropship, r/ecommerce)
2. YouTube (dropshipping tutorials)
3. Blog posts (SEO-optimized)

**Goal:** 200 new MAU from organic channels

### Phase 3: Automation Workflows (Month 3-6)

**Tactics:**
1. n8n/Zapier/Make.com templates
2. Partner with automation YouTubers
3. Integration showcases

**Goal:** 100 MAU from automation users

## Revenue Projections

### Conservative (Year 1)
- Month 1-3: 100 MAU, $2k/month
- Month 4-6: 200 MAU, $5k/month
- Month 7-12: 383 MAU, $7k/month
- **Total Year 1:** $86,916

### Realistic (Year 2)
- 1,000 MAU (3% of 30k SAM)
- Mix: 50% PPR, 40% Monthly, 10% Enterprise
- **Total Year 2:** $240-360k/year

## Support & Maintenance

### Weekly Tasks
- Monitor success rate (should be >95%)
- Check for Cloudflare/Etsy anti-bot updates
- Review user feedback/issues
- Update selectors if needed

### Monthly Tasks
- Analyze top 10 user queries (optimize for common use cases)
- Review pricing strategy (competitive analysis)
- Add requested features (prioritize by demand)

### Response Times
- Email support: < 24 hours
- Bug fixes: < 48 hours (critical), < 1 week (non-critical)
- Feature requests: < 2 weeks (evaluate), 2-4 weeks (implement)

## Contact

- **Developer:** WebDataLabs
- **Email:** via Apify
- **Apify:** https://apify.com/webdatalabs
- **GitHub:** https://github.com/webdatalabs

---

**Status:** Ready for testing and deployment 🚀

**Next Steps:**
1. Test with 100 real Etsy products
2. Deploy to Apify platform
3. Configure pay-per-event pricing
4. Launch marketing campaign
5. Monitor performance and iterate
