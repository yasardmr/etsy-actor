import { z } from 'zod';

// Input schema validation
export const InputSchema = z.object({
    // Search parameters
    query: z.string().optional(),
    searchUrl: z.string().url().optional(),
    categoryUrl: z.string().url().optional(),
    shopUrl: z.string().url().optional(),
    productUrls: z.array(z.string().url()).optional(),

    // Limits
    maxItems: z.number().int().min(0).default(100),
    maxReviewsPerProduct: z.number().int().min(0).default(10),

    // Filters
    minRating: z.number().min(0).max(5).optional(),
    minReviews: z.number().int().min(0).optional(),
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),

    // Features
    includeReviews: z.boolean().default(true),
    includeShopDetails: z.boolean().default(true),

    // Proxy configuration
    proxyConfiguration: z.object({
        useApifyProxy: z.boolean().default(true),
        apifyProxyGroups: z.array(z.string()).optional(),
    }).optional(),

    // Advanced
    maxConcurrency: z.number().int().min(1).max(10).default(3),

    // CAPTCHA solving (CapSolver for DataDome - $2.99/1000 solves)
    capsolverApiKey: z.string().optional(),
});

export type ValidatedInput = z.infer<typeof InputSchema>;

// Simplified product data structure (from search results)
export interface EtsyProduct {
    // Basic info
    productId: string;
    title: string;
    url: string;

    // Pricing
    price: number;

    // Ratings & reviews
    rating: number;
    reviewCount: number;

    // Shop info
    shopName: string;
    shopUrl: string;

    // Image
    imageUrl: string;

    // Scraping metadata
    scrapedAt?: string;
}

// Review data structure
export interface EtsyReview {
    reviewId: string;
    productId: string;
    rating: number;
    text: string;
    reviewerName: string;
    reviewerAvatar?: string;
    date: string;
    verified: boolean;
    photos?: string[];
    variation?: string;
    helpful?: number;
}

// Shop data structure
export interface EtsyShop {
    shopId: string;
    shopName: string;
    shopUrl: string;
    owner: string;
    location: string;
    joinedDate: string;
    salesCount: number;
    rating: number;
    reviewCount: number;
    listingCount: number;
    favoriters: number;
    description: string;
    announcement?: string;
    policies: {
        returns?: string;
        shipping?: string;
        payment?: string;
    };
    socialLinks: string[];
    topCategories: string[];
    scrapedAt: string;
}

// JSON-LD structured data (from Etsy pages)
export interface ProductJsonLD {
    '@type': string;
    name: string;
    image?: string | string[];
    description?: string;
    sku?: string;
    brand?: {
        '@type': string;
        name: string;
    };
    offers?: {
        '@type': string;
        price?: string;
        priceCurrency?: string;
        availability?: string;
        url?: string;
    };
    aggregateRating?: {
        '@type': string;
        ratingValue?: string;
        reviewCount?: string;
        bestRating?: string;
        worstRating?: string;
    };
}
