# DataDome CAPTCHA Solving - Root Cause Analysis & Solutions

## Executive Summary

After deep research, I've identified **FIVE CRITICAL ISSUES** causing your DataDome solving failures:

1. ❌ **User-Agent set incorrectly** (not being applied to browser)
2. ❌ **User-Agent mismatch** (browser UA ≠ CapSolver UA)
3. ❌ **Cookie domain incorrect** (hardcoded to `.etsy.com`)
4. ❌ **Proxy format may be incomplete** (missing protocol prefix)
5. ❌ **Cookie set AFTER page load** (should be set BEFORE navigation)

---

## ROOT CAUSE #1: User-Agent Not Being Applied to Browser

### The Problem

```typescript
// ❌ WRONG (from your datadome-solver.ts line 168)
const supportedUserAgent = DataDomeSolver.SUPPORTED_USER_AGENT;

// Then in main.ts line 205:
await page.setExtraHTTPHeaders({ 'User-Agent': randomUA });
```

**Critical finding from research**: Setting `userAgent` in `launchOptions` **DOES NOT WORK** in Crawlee's PlaywrightCrawler. The `userAgent` property must be set at the `launchContext` level, NOT in `launchOptions` or via headers.

### The Solution

```typescript
// ✅ CORRECT - Set at launchContext level
const crawler = new PlaywrightCrawler({
  launchContext: {
    launcher: chromium,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Set here!
    launchOptions: {
      headless: false,
      // ...
    },
  },
  // ...
});
```

**Why this matters for DataDome**:
- CapSolver receives one UA (e.g., Windows Chrome 120)
- Browser actually uses a different UA (e.g., macOS Safari)
- DataDome validates the cookie against the **actual browser fingerprint**
- Mismatch = cookie rejected = CAPTCHA still shows

---

## ROOT CAUSE #2: User-Agent Mismatch Between CapSolver and Browser

### The Problem

From your logs:
```
🌐 Browser UA: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...
🌐 CapSolver UA: Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
```

**The browser is showing macOS**, but CapSolver thinks it's Windows!

### Why This Happens

From CapSolver documentation:
> "The userAgent sent to the API must match the one used for the target site."

**DataDome validation flow**:
1. CapSolver solves CAPTCHA with Windows Chrome fingerprint
2. Returns cookie tied to that fingerprint
3. You set cookie in browser
4. DataDome checks: "Does this cookie match the current browser fingerprint?"
5. ❌ Browser shows macOS → Cookie was for Windows → **VALIDATION FAILS**

### The Solution

**Use the SAME user agent everywhere**:

```typescript
// Define once, use everywhere
const DATADOME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In crawler config:
const crawler = new PlaywrightCrawler({
  launchContext: {
    userAgent: DATADOME_USER_AGENT, // Browser gets this UA
    // ...
  },
});

// In CapSolver request:
task: {
  userAgent: DATADOME_USER_AGENT, // CapSolver uses same UA
  // ...
}
```

---

## ROOT CAUSE #3: Cookie Domain Hardcoded Incorrectly

### The Problem

```typescript
// ❌ WRONG (from datadome-solver.ts line 269)
await page.context().addCookies([{
  name: 'datadome',
  value: cookieValue,
  domain: '.etsy.com',  // ← HARDCODED!
  // ...
}]);
```

**Issue**: Your solver is ONLY for Etsy, but DataDome is a generic anti-bot service used by many sites. The cookie domain should match the **current page's domain**, not be hardcoded.

### The Solution

```typescript
// ✅ CORRECT - Extract domain from current URL
private async setCookie(page: Page, cookieString: string): Promise<void> {
  const match = cookieString.match(/datadome=([^;]+)/);
  if (!match) {
    console.error('   ⚠️ Invalid cookie format from CapSolver');
    return;
  }

  const cookieValue = match[1];

  // Extract domain from current page URL
  const url = new URL(page.url());
  const domain = url.hostname.startsWith('www.')
    ? '.' + url.hostname.substring(4)  // Remove 'www.' but keep the dot
    : '.' + url.hostname;

  await page.context().addCookies([{
    name: 'datadome',
    value: cookieValue,
    domain: domain,  // ✅ Dynamic domain
    path: '/',
    httpOnly: false,  // DataDome cookies are NOT httpOnly
    secure: true,
    sameSite: 'Lax'
  }]);

  console.log(`   ✓ DataDome cookie set for domain: ${domain}`);
}
```

---

## ROOT CAUSE #4: Proxy Format May Be Incomplete

### The Problem

```typescript
// From datadome-solver.ts line 164:
const proxyString = `http:${proxyInfo.hostname}:${proxyInfo.port}:${proxyInfo.username}:${proxyInfo.password}`;
```

**Potential issue**: CapSolver expects format `"http:host:port:user:pass"` but you're constructing it manually. If any field is missing or has unexpected format, this could cause 400 errors.

### The Solution

Add validation and better error messages:

```typescript
private formatProxyForCapSolver(proxyInfo: any): string | null {
  // Validate all required fields are present
  if (!proxyInfo || !proxyInfo.hostname || !proxyInfo.port) {
    console.error('   ❌ ProxyInfo missing hostname or port');
    return null;
  }

  // Build proxy string
  const proxyString = `http:${proxyInfo.hostname}:${proxyInfo.port}:${proxyInfo.username || ''}:${proxyInfo.password || ''}`;

  console.log(`   🔗 Proxy format: http:${proxyInfo.hostname}:${proxyInfo.port}:***:***`);

  return proxyString;
}
```

---

## ROOT CAUSE #5: Cookie Set AFTER Page Load (Most Critical!)

### The Problem

**Your current flow**:
1. Navigate to page → DataDome challenge appears
2. Solve CAPTCHA → Get cookie
3. Set cookie in browser
4. **RELOAD page** → Challenge still there

**Why this fails**: DataDome's JavaScript on the page has already fingerprinted your browser BEFORE you set the cookie. Reloading doesn't help because:
- The page JavaScript re-checks fingerprint on reload
- Cookie was issued for a different fingerprint (from CapSolver's solve)
- Mismatch = cookie rejected

### The Solution

**Set the cookie BEFORE navigating to the page**:

```typescript
async solveDataDome(page: Page, proxyInfo: any, targetUrl: string, maxRetries = 2): Promise<boolean> {
  // 1. First, navigate to check if DataDome is present
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  // 2. Check if DataDome challenge is present
  const isDataDome = await this.detectDataDome(page);
  if (!isDataDome) return true;

  // 3. Solve with CapSolver
  const cookie = await this.solveWithCapSolver(targetUrl, captchaUrl, userAgent, proxyInfo);
  if (!cookie) return false;

  // 4. Set cookie in context
  await this.setCookie(page, cookie);

  // 5. ⚠️ CRITICAL: Close this page and open a NEW page with the cookie already set
  await page.close();

  // Browser context still has the cookie, so new pages will have it from the start
  return true; // Let the crawler open a new page naturally
}
```

**Even better approach - Set cookie BEFORE first navigation**:

```typescript
preNavigationHooks: [
  async ({ request, page, session }, gotoOptions) => {
    // Check if we have a DataDome cookie in session storage
    const dataDomeCookie = session.userData.dataDomeCookie;

    if (dataDomeCookie) {
      // Set cookie BEFORE navigation
      await page.context().addCookies([dataDomeCookie]);
      console.log('   ✓ Using cached DataDome cookie');
    }

    // ... rest of your preNavigationHooks
  }
]
```

---

## Understanding DataDome's Cookie Validation

From research, here's how DataDome validates cookies:

### What DataDome Checks:
1. **Cookie value** (signed token)
2. **Browser fingerprint** (canvas, WebGL, fonts, etc.)
3. **User-Agent** (must match token)
4. **IP address** (must match token - why proxy consistency matters)
5. **TLS fingerprint** (HTTP/2, cipher suites)
6. **Behavioral signals** (mouse movement, timing)

### Why Your Cookie Fails:
- ✅ Cookie value is correct (CapSolver solved it)
- ❌ Browser fingerprint doesn't match (UA mismatch)
- ❌ Cookie set after JavaScript fingerprinting
- ❌ Possible proxy session changed between solve and page load

---

## The 400 Error from CapSolver

### Likely Causes:

Based on CapSolver error codes:
- `ERROR_INVALID_TASK_DATA` - Incorrect task parameters
- `ERROR_PROXY_BANNED` - Proxy IP is blocked
- `ERROR_TASK_NOT_SUPPORTED` - Wrong captcha type

### Debug Steps:

1. **Log the full CapSolver request**:
```typescript
const requestPayload = {
  clientKey: this.apiKey,
  task: {
    type: 'DatadomeSliderTask',
    websiteURL: pageUrl,
    captchaUrl: captchaUrl,
    userAgent: supportedUserAgent,
    proxy: proxyString,
  }
};

console.log('   📋 CapSolver request:', JSON.stringify(requestPayload, null, 2));

const createResponse = await axios.post(
  'https://api.capsolver.com/createTask',
  requestPayload
);
```

2. **Log the error response body**:
```typescript
} catch (error: any) {
  if (error.response) {
    console.error(`   ❌ CapSolver error response:`, JSON.stringify(error.response.data, null, 2));
  }
  // ...
}
```

3. **Validate captchaUrl format**:
```typescript
// Check for banned IP indicator
if (captchaUrl.includes('t=bv')) {
  console.error('   ❌ IP BANNED by DataDome (t=bv in URL)');
  console.error('   💡 Rotate proxy session and try again');
  return null;
}

// Check for valid format
if (!captchaUrl.includes('t=fe')) {
  console.error('   ⚠️ Unusual captchaUrl format (expected t=fe):', captchaUrl);
}
```

---

## Complete Fixed Implementation

### 1. Update main.ts

```typescript
// Define consistent UA (at top of file)
const DATADOME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In crawler config:
const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  useSessionPool: true,
  persistCookiesPerSession: true,
  launchContext: {
    launcher: chromium,
    userAgent: DATADOME_USER_AGENT, // ✅ Set at launchContext level
    launchOptions: {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    },
  },
  preNavigationHooks: [
    async ({ request, page, session }, gotoOptions) => {
      // Set viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Add anti-detection scripts
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        (window as any).chrome = { runtime: {} };
      });

      // Set headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
      });

      gotoOptions.waitUntil = 'domcontentloaded';
      gotoOptions.timeout = 60000;
    },
  ],
  requestHandler: async ({ page, request, proxyInfo }) => {
    // ...

    // Pass DATADOME_USER_AGENT to solver
    const datadomeSolved = await this.dataDomeSolver.solveDataDome(
      page,
      proxyInfo,
      DATADOME_USER_AGENT  // ✅ Same UA everywhere
    );

    // ...
  },
});
```

### 2. Update datadome-solver.ts

```typescript
export class DataDomeSolver {
  // Remove the static SUPPORTED_USER_AGENT (it will be passed in)

  async solveDataDome(
    page: Page,
    proxyInfo: any,
    userAgent: string,  // ✅ Pass UA as parameter
    maxRetries = 2
  ): Promise<boolean> {
    // ... detection logic ...

    const cookie = await this.solveWithCapSolver(
      captchaData.pageUrl,
      captchaData.captchaUrl,
      userAgent,  // ✅ Use the same UA browser has
      proxyInfo
    );

    // ... rest of implementation ...
  }

  private async solveWithCapSolver(
    pageUrl: string,
    captchaUrl: string,
    userAgent: string,  // ✅ Passed from browser
    proxyInfo: any
  ): Promise<string | null> {
    // Validate proxy info
    if (!proxyInfo || !proxyInfo.hostname || !proxyInfo.port) {
      console.error('   ❌ Invalid proxyInfo:', proxyInfo);
      return null;
    }

    // Format proxy
    const proxyString = `http:${proxyInfo.hostname}:${proxyInfo.port}:${proxyInfo.username || ''}:${proxyInfo.password || ''}`;

    console.log(`   🔗 Proxy: ${proxyInfo.hostname}:${proxyInfo.port}`);
    console.log(`   🌐 UserAgent: ${userAgent.substring(0, 60)}...`);
    console.log(`   🔑 CaptchaURL: ${captchaUrl.substring(0, 80)}...`);

    // Check for banned IP
    if (captchaUrl.includes('t=bv')) {
      console.error('   ❌ IP BANNED (t=bv) - rotate proxy session');
      return null;
    }

    const requestPayload = {
      clientKey: this.apiKey,
      task: {
        type: 'DatadomeSliderTask',
        websiteURL: pageUrl,
        captchaUrl: captchaUrl,
        userAgent: userAgent,  // ✅ Same as browser
        proxy: proxyString,
      }
    };

    console.log('   📋 CapSolver request:', JSON.stringify(requestPayload, null, 2));

    try {
      const createResponse = await axios.post(
        'https://api.capsolver.com/createTask',
        requestPayload,
        { timeout: 10000 }
      );

      console.log('   📋 CapSolver response:', JSON.stringify(createResponse.data, null, 2));

      // ... rest of solving logic ...

    } catch (error: any) {
      console.error(`   ❌ CapSolver error: ${error.message}`);
      if (error.response) {
        console.error(`   📋 Error response:`, JSON.stringify(error.response.data, null, 2));
      }
      return null;
    }
  }

  private async setCookie(page: Page, cookieString: string): Promise<void> {
    const match = cookieString.match(/datadome=([^;]+)/);
    if (!match) {
      console.error('   ⚠️ Invalid cookie format');
      return;
    }

    const cookieValue = match[1];

    // ✅ Extract domain from current URL
    const url = new URL(page.url());
    const domain = url.hostname.startsWith('www.')
      ? '.' + url.hostname.substring(4)
      : '.' + url.hostname;

    await page.context().addCookies([{
      name: 'datadome',
      value: cookieValue,
      domain: domain,  // ✅ Dynamic
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax'
    }]);

    console.log(`   ✓ Cookie set for ${domain}`);
  }
}
```

---

## Testing Checklist

Before deploying, verify:

- [ ] User-Agent set at `launchContext` level (not `launchOptions`)
- [ ] Same UA used in browser AND CapSolver request
- [ ] Cookie domain extracted dynamically from page URL
- [ ] Proxy format validated before sending to CapSolver
- [ ] Full CapSolver request/response logged for debugging
- [ ] Check for `t=bv` in captchaUrl (indicates banned IP)
- [ ] Cookie set before navigation (if possible) or page closed/reopened after setting cookie

---

## Expected Behavior After Fixes

### Success Flow:
```
🔍 Scraping: https://www.etsy.com/search?q=...
   ⚠️ DataDome detected
   🔑 Solving with CapSolver...
   📋 CapSolver request: { type: 'DatadomeSliderTask', userAgent: 'Mozilla/5.0 (Windows NT 10.0...' }
   📋 CapSolver response: { taskId: 'abc123', status: 'processing' }
   ⏳ Waiting for solution...
   ✅ Solution received in 45 seconds
   ✓ Cookie set for .etsy.com
   🔄 Reloading page...
   ✅ DataDome bypass successful!
```

### If Still Failing:

1. **Check CapSolver balance**: Visit capsolver.com/dashboard
2. **Verify API key**: Ensure it's valid and has credits
3. **Test captchaUrl manually**: Use CapSolver's test interface
4. **Check proxy**: Try with different proxy session
5. **Verify UA match**: Log both browser and CapSolver UA, ensure identical

---

## Additional Resources

- **CapSolver DataDome Docs**: https://docs.capsolver.com/en/guide/captcha/datadome/
- **CapSolver Error Codes**: https://docs.capsolver.com/en/guide/api-error/
- **Crawlee Proxy Management**: https://crawlee.dev/js/docs/guides/proxy-management
- **Playwright User-Agent**: https://playwright.dev/docs/api/class-browsercontext#browser-context-set-extra-http-headers

---

## Summary

**The main issues**:
1. UA not being applied to browser (wrong config location)
2. UA mismatch between browser and CapSolver
3. Hardcoded cookie domain
4. Possible proxy format issues
5. Cookie timing (set after fingerprinting)

**The fixes**:
1. Set `userAgent` at `launchContext` level
2. Use same UA for browser and CapSolver
3. Extract domain dynamically from page URL
4. Validate proxy format and add detailed logging
5. Consider setting cookie before navigation or reopening page

**Next steps**:
1. Implement the fixes above
2. Add comprehensive logging
3. Test with a single request
4. Verify the 400 error is resolved
5. Check if cookie bypass works

The 400 error is likely due to invalid proxy format or missing userAgent consistency. Once you apply these fixes, you should see either:
- ✅ Successful solve → Cookie works → DataDome bypassed
- ❌ Different error → Use detailed logs to debug further
