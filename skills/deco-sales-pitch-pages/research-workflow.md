# Research Workflow Reference

Quick reference for the research phase of sales pitch creation.

## Step 1: Core Web Vitals

### Option A: PageSpeed Insights (Recommended)

Visit: `https://pagespeed.web.dev/`

Enter target URL and capture:
- LCP (target < 2.5s)
- INP (target < 200ms)
- CLS (target < 0.1)
- FCP (target < 1.8s)
- Speed Index (target < 3.4s)

### Option B: Programmatic

```bash
# Basic request (no API key needed)
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile"
```

## Step 2: CrUX Data

Chrome User Experience Report shows real user data (28-day rolling).

### Option A: web.dev/measure

Visit: `https://web.dev/measure/`
- Enter URL
- View "Origin" tab for site-wide metrics
- Check "Field Data" section in PageSpeed

### Option B: CrUX API

```bash
curl -X POST "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=[API_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Step 3: Perplexity Research Queries

### Company Overview
```
[COMPANY] ecommerce company overview revenue funding team size 
headquarters technology 2025 2026
```

### Technology Stack
```
[COMPANY] website technology stack platform Shopify headless CMS 
architecture hydrogen next.js
```

### Performance Issues
```
[COMPANY] website slow performance issues customer complaints 
checkout problems
```

### Recent News
```
[COMPANY] ecommerce news announcements funding expansion 2025 2026
```

### Job Postings (Pain Signal)
```
[COMPANY] hiring frontend developer ecommerce platform engineer 
job posting
```

## Step 4: Firecrawl Analysis

Use firecrawl to scrape the target site for additional signals:

```json
{
  "url": "https://example.com",
  "formats": ["markdown"],
  "onlyMainContent": true
}
```

Look for:
- Technology indicators in meta tags
- Third-party script references
- Performance-affecting patterns
- Content structure

## Step 5: Competitive Intelligence

### BuiltWith Lookup
Check technology profile at: `https://builtwith.com/[domain]`

### SimilarWeb Traffic
Estimate traffic at: `https://www.similarweb.com/website/[domain]`

### Store Leads (Shopify specific)
Check store details at: `https://storeleads.app/reports/shopify/`

## Output: Pitch Strategy Document

Create in `context/02_strategy/pitches/YYYY-MM-DD-[slug]-pitch-strategy.md`

Template structure:
1. Executive Summary
2. Company Profile
3. Performance Analysis (CWV data)
4. Pain Points Identified
5. How Deco Solves Their Problems
6. Competitive Positioning
7. The "Wow" Moment
8. Pitch Page Sections Plan
9. Objection Handling
10. Contact Strategy

## Quick Checklist

- [ ] PageSpeed Insights run (mobile + desktop)
- [ ] CrUX historical data captured
- [ ] Perplexity company research done
- [ ] Perplexity stack research done
- [ ] Pain points documented with evidence
- [ ] Revenue impact calculated
- [ ] Pitch strategy document created
- [ ] Landing page sections configured
- [ ] Page JSON created in decocms
- [ ] Password hash generated
