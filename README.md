# Etsy Search Results Scraper - Extract Product Data from Etsy

Fast and reliable Etsy scraper that extracts product listings from search results. Get product titles, prices, ratings, reviews, shop names, and images - perfect for market research, price monitoring, competitor analysis, and e-commerce automation.

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-0084FF?logo=apify)](https://apify.com/webdatalabs/etsy-scraper-pro)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-success)](https://github.com/webdatalabs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What can you do with this Etsy scraper?

- **Market Research**: Analyze trending products, pricing strategies, and popular categories on Etsy
- **Competitor Analysis**: Monitor competitor products, prices, and customer reviews
- **Price Monitoring**: Track product prices over time for dropshipping or reselling
- **Product Discovery**: Find top-rated handmade, vintage, and craft products
- **E-commerce Automation**: Feed Etsy data to Zapier, Make, n8n, or Google Sheets
- **Trend Analysis**: Discover trending searches and popular product categories

## Features

### ✅ What data can you extract?

Each product includes:
- **Product ID** - Unique Etsy listing identifier
- **Title** - Full product name/title
- **URL** - Direct link to product page
- **Price** - Current product price (USD)
- **Rating** - Star rating (0-5 stars)
- **Review Count** - Total number of customer reviews
- **Shop Name** - Seller/shop name
- **Shop URL** - Link to seller's Etsy shop
- **Product Image** - Main product photo URL
- **Scraped At** - Timestamp when data was collected

### ✅ Smart filtering

- Filter by minimum rating (e.g., only 4+ star products)
- Filter by minimum reviews (e.g., only products with 10+ reviews)
- Filter by price range (min/max price)
- Limit results to your desired quantity

### ✅ Fast and reliable

- Extracts 60-100 products per search in seconds
- Bypasses DataDome anti-bot protection
- Uses residential proxies for 100% success rate
- Modern anti-detection technology (Crawlee fingerprint suite)

## Quick Start

### Simple search

Search for "handmade jewelry" and get 50 products:

```json
{
  "query": "handmade jewelry",
  "maxItems": 50
}
```

### With filters

Get high-rated leather wallets with reviews:

```json
{
  "query": "leather wallet",
  "maxItems": 100,
  "minRating": 4.5,
  "minReviews": 50,
  "priceMin": 20,
  "priceMax": 100
}
```

### Use a direct search URL

```json
{
  "searchUrl": "https://www.etsy.com/search?q=vintage%20watch&explicit=1&order=most_relevant"
}
```

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | String | No | Search keyword (e.g., "handmade jewelry") |
| `searchUrl` | String | No | Direct Etsy search URL (alternative to query) |
| `maxItems` | Integer | No | Maximum products to extract (default: 100) |
| `minRating` | Number | No | Filter by minimum rating (1-5 stars) |
| `minReviews` | Integer | No | Filter by minimum number of reviews |
| `priceMin` | Number | No | Minimum price filter (USD) |
| `priceMax` | Number | No | Maximum price filter (USD) |

## Example Output

```json
{
  "productId": "1234567890",
  "title": "Handmade Leather Wallet - Personalized Gift for Men",
  "url": "https://www.etsy.com/listing/1234567890/handmade-leather-wallet",
  "price": 49.99,
  "rating": 4.8,
  "reviewCount": 1234,
  "shopName": "LeatherCraftShop",
  "shopUrl": "https://www.etsy.com/shop/LeatherCraftShop",
  "imageUrl": "https://i.etsystatic.com/12345678/r/il/abc123/1234567890/il_570xN.1234567890_xyz1.jpg",
  "scrapedAt": "2025-01-15T10:30:00.000Z"
}
```

## Use Cases

### 1. **Market Research**
Extract hundreds of products to analyze:
- Popular price points in your niche
- Common keywords in top-rated products
- Average review counts for successful listings
- Trending categories and styles

### 2. **Competitor Monitoring**
Track your competitors:
- Monitor their new product launches
- Track price changes
- Analyze their ratings and reviews
- Identify their best-selling items

### 3. **Price Intelligence**
Build a price monitoring system:
- Track prices over time (schedule daily runs)
- Identify underpriced items for reselling
- Optimize your own pricing strategy
- Find arbitrage opportunities

### 4. **E-commerce Automation**
Integrate with automation tools:
- Export to Google Sheets for analysis
- Send to n8n, Zapier, or Make workflows
- Import into your database or CRM
- Feed to AI tools for trend analysis

### 5. **Product Discovery**
Find new products to sell:
- Discover trending handmade items
- Identify vintage products in demand
- Find craft supplies with high demand
- Research gift ideas by category

## Integration Examples

### Export to Google Sheets
1. Run the scraper
2. Download results as CSV
3. Import to Google Sheets
4. Analyze with formulas and charts

### Zapier Integration
1. Trigger: Schedule (daily/weekly)
2. Action: Run Apify actor
3. Action: Add rows to Google Sheets
4. Action: Send Slack notification with top products

### n8n Workflow
```
Schedule → Apify → Filter (minRating > 4) → Airtable → Email Report
```

## Technical Details

### Anti-Bot Protection
This scraper uses advanced techniques to bypass Etsy's DataDome protection:
- **Crawlee fingerprint suite** - Generates realistic browser fingerprints
- **Session warmup** - Simulates real user browsing behavior
- **Ghost cursor** - Human-like mouse movements with Bezier curves
- **Natural timing** - Random delays with normal distribution
- **Residential proxies** - US residential IPs (included, no extra cost)

### Performance
- **Speed**: 60-100 products per search (5-10 seconds)
- **Success rate**: 100% on search pages
- **Reliability**: Built-in retry logic and error handling
- **Scalability**: Schedule runs for continuous monitoring

## 🔗 Integration with Automation Tools

### n8n Workflow Example

**Daily Trending Products Monitor:**
```
Schedule (10am daily)
  ↓
Apify: Run Etsy Scraper (query: "trending")
  ↓
Filter: rating >= 4.5 AND reviewCount > 100
  ↓
Airtable: Add to "Hot Products" table
  ↓
Slack: Post top 10 products with images
```

### Zapier Workflow Example

**Competitor Price Tracking:**
```
1. Schedule: Daily at 9am
2. Run Apify actor (Etsy Scraper Pro)
3. Filter: shopName = "CompetitorShop"
4. Google Sheets: Update price tracking sheet
5. Gmail: Send alert if price drops > 15%
```

### Make.com Workflow Example

**Market Research Automation:**
```
1. Etsy Scraper: Search "handmade jewelry"
2. Iterator: Process each product
3. HTTP: Analyze keywords with ChatGPT
4. Airtable: Save insights to research base
5. Notion: Update market research page
```

## ❓ FAQ

### Can I scrape individual product pages?

This actor extracts data from search result pages only. Product detail pages are currently not supported due to advanced anti-bot protection.

### What's the difference between this and other Etsy scrapers?

This scraper is actively maintained (2025) and uses the latest anti-detection technology. It's specifically optimized for search results extraction with 100% success rate.

### Can I use this with n8n or Zapier?

Yes! The output is flat JSON, perfect for integration with automation tools like n8n, Zapier, Make, Google Sheets, and databases.

### How often can I run this?

As often as you need. Schedule it via Apify's scheduler for automated daily/weekly runs.

### Are proxies included?

Yes, US residential proxies are included at no extra cost. They're required for bypassing Etsy's protection.

### Can I filter results?

Yes, filter by minimum rating, minimum reviews, and price range (min/max).

### What format is the output?

JSON, CSV, Excel, HTML, or XML - choose your preferred format when downloading.

### How do I search for specific products?

Use the `query` parameter with your search keyword (e.g., "vintage watches", "handmade candles"). Or provide a direct `searchUrl` from Etsy's search results page.

### Can I scrape multiple searches in one run?

Not currently, but you can schedule multiple runs with different queries using Apify's scheduler or automation tools.

### Why use residential proxies instead of datacenter?

Etsy uses DataDome anti-bot protection that instantly blocks datacenter IPs. Residential proxies mimic real users and are essential for reliable scraping.

---

## 🔗 Explore More of Our Actors

### 🛒 E-commerce

| Actor | Description |
|-------|-------------|
| [Shopify Scraper Pro](https://apify.com/webdatalabs/shopify-scraper-pro) | Extract complete Shopify product data with variants and sales estimates |
| [eBay Scraper (PPR)](https://apify.com/webdatalabs/ebay-scraper-pro) | Extract eBay products with seller analytics and engagement metrics |
| [Amazon Reviews Scraper](https://apify.com/webdatalabs/amazon-reviews-scraper) | Extract Amazon customer reviews for sentiment analysis |
| [TikTok Shop Scraper](https://apify.com/webdatalabs/tiktok-shop-scraper) | Extract TikTok Shop products with sales metrics and reviews |

### 💬 Social Media & Brand Monitoring

| Actor | Description |
|-------|-------------|
| [Reddit Scraper Pro](https://apify.com/webdatalabs/reddit-scraper-pro) | Monitor subreddits and track keywords with sentiment analysis |
| [Discord Scraper Pro](https://apify.com/webdatalabs/discord-scraper-pro) | Extract Discord messages and chat history for community insights |
| [YouTube Comments Harvester](https://apify.com/webdatalabs/youtube-comments-harvester) | Comprehensive YouTube comments scraper with channel-wide enumeration |

### 📊 Price Comparison

| Actor | Description |
|-------|-------------|
| [Billiger.de Scraper](https://apify.com/webdatalabs/billiger-de-scraper) | Extract prices from Germany's largest price comparison platform |
| [Geizhals Scraper Pro](https://apify.com/webdatalabs/geizhals-scraper-pro) | Scrape Geizhals.de for tech product prices and specifications |

---

## 🏷️ SEO Keywords

Etsy scraper, Etsy data extraction, Etsy API alternative, scrape Etsy products, Etsy product data, Etsy market research, Etsy competitor analysis, Etsy price monitoring, extract Etsy listings, Etsy automation, Etsy search results, handmade products data, vintage items scraper, Etsy shop analytics, e-commerce data scraping, Etsy trend analysis, Etsy pricing intelligence, Etsy product discovery, web scraping Etsy, Etsy data mining, Etsy business intelligence, how to scrape Etsy, n8n Etsy integration, Zapier Etsy scraper, Make Etsy automation, Etsy arbitrage tool, Etsy dropshipping research, Etsy seller data

## Support

- **Documentation**: [Apify Documentation](https://docs.apify.com)
- **Issues**: Report bugs via Apify support
- **Updates**: This actor is actively maintained and updated regularly

## License

MIT License - Free to use for commercial and personal projects.

---

**Built by WebDataLabs** | **Last Updated**: January 2025 | **Status**: ✅ Active


---

## 📬 Custom Solutions & Enterprise

Need a custom data feed, modified output format, or enterprise integration?

**Contact:** Furkanc58@gmail.com

I offer:
- Daily/weekly data feeds (Snowflake, S3, BigQuery, Google Sheets)
- Custom scrapers for platforms not yet covered
- White-label solutions for agencies
- Priority support and SLAs

*Response within 24-48 hours.*

## Legal Disclaimer

This actor is a general-purpose tool for analyzing publicly accessible web data. The user bears sole responsibility for ensuring their specific use complies with:
- Applicable laws (GDPR/DSGVO, copyright law)
- The target website's Terms of Service
- Apify's Terms of Service

The provider (webdatalabs) expressly disclaims liability for any unauthorized or unlawful use. By using this actor, the user agrees to indemnify the provider against any third-party claims arising from their use of the data.


---

*This tool is not affiliated with Etsy. All trademarks belong to their respective owners.*
