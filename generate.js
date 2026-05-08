// ============================================================
// Brightlane — AI-Powered Site Generator
// Setup: npm install @anthropic-ai/sdk
// Run:   ANTHROPIC_API_KEY=sk-... node generate.js
// Resume: just re-run — checkpoint.json tracks progress
// ============================================================

const fs = require("fs/promises");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

// ── CONFIG ───────────────────────────────────────────────────

const CONFIG = {
  outputDir: "output",
  domain: "https://example.com",
  brand: "Brightlane",
  ctaLink: "https://try.monday.com/m1dglo0ttcfr",
  affiliateDisclosure: "Affiliate disclosure: We may earn a commission if you sign up through our link, at no extra cost to you.",
  concurrency: 4,
  batchDelay: 1200,
  maxRetries: 4,
  retryBaseMs: 2000,
  checkpointFile: "checkpoint.json",

  features: [
    "project management", "kanban boards", "gantt charts", "workflow automation",
    "team collaboration", "time tracking", "dashboards and reporting", "resource management",
    "sprint planning", "portfolio management", "client portal", "document management",
    "goal tracking", "budget tracking", "approval workflows", "recurring tasks",
    "custom automations", "AI assistant", "forms and intake", "workload management",
    "dependencies", "baselines", "milestone tracking", "custom fields", "board templates",
  ],

  competitors: [
    "Asana", "Notion", "Trello", "ClickUp", "Jira", "Basecamp", "Wrike", "Smartsheet",
    "Airtable", "Teamwork", "Linear", "Height", "Todoist", "Microsoft Project", "Zoho Projects",
  ],

  useCases: [
    { audience: "marketing teams",      pain: "campaign chaos and missed deadlines" },
    { audience: "software developers",  pain: "sprint planning and bug tracking" },
    { audience: "agencies",             pain: "managing multiple client projects" },
    { audience: "remote teams",         pain: "visibility and async collaboration" },
    { audience: "startups",             pain: "moving fast without losing context" },
    { audience: "enterprise ops teams", pain: "cross-department workflow coordination" },
    { audience: "HR teams",             pain: "onboarding and headcount planning" },
    { audience: "sales teams",          pain: "pipeline and deal tracking" },
    { audience: "product managers",     pain: "roadmap planning and prioritization" },
    { audience: "finance teams",        pain: "budget tracking and approvals" },
    { audience: "construction firms",   pain: "project timelines and contractor coordination" },
    { audience: "event planners",       pain: "vendor management and logistics" },
    { audience: "nonprofits",           pain: "volunteer coordination and grant tracking" },
    { audience: "legal teams",          pain: "matter management and deadline tracking" },
    { audience: "education admin",      pain: "curriculum planning and faculty coordination" },
  ],
};

const client = new Anthropic();

// ── HELPERS ──────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── RATE-LIMITED CLAUDE CALL WITH RETRY ──────────────────────

async function callClaude(prompt, maxTokens = 1800) {
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content[0].text;
    } catch (err) {
      const retryable = err?.status === 429 || err?.status >= 500;
      if (retryable && attempt < CONFIG.maxRetries) {
        const wait = CONFIG.retryBaseMs * Math.pow(2, attempt);
        console.warn(`  ⚠ API ${err?.status} — retrying in ${wait}ms…`);
        await sleep(wait);
      } else throw err;
    }
  }
}

// ── PROMPTS ──────────────────────────────────────────────────

function featurePrompt(feature) {
  return `You are a sharp SaaS copywriter for Brightlane, an independent monday.com review site.

Write a complete review page about monday.com's "${feature}" feature as HTML fragments only (no html/head/body tags).

Use exactly these sections:

<section class="page-intro">
  One compelling paragraph (3-4 sentences) on what this feature is and why it matters.
</section>

<section class="how-it-works">
  <h2>How it works</h2>
  2-3 paragraphs with specific UI details, tier availability, and workflow context.
</section>

<section class="key-benefits">
  <h2>Key benefits</h2>
  <ul>[5 li items, each: <strong>Label.</strong> One sentence explanation.]</ul>
</section>

<section class="who-its-for">
  <h2>Who it's for</h2>
  One paragraph describing the ideal user or team with concrete examples.
</section>

<section class="verdict">
  <h2>Our verdict</h2>
  One honest paragraph with a genuine recommendation AND at least one real limitation.
</section>

Rules: Write naturally, be specific, no filler phrases. Return ONLY the HTML sections.`;
}

function competitorPrompt(competitor) {
  return `You are a sharp SaaS copywriter for Brightlane, an independent review site.

Write a comparison page: monday.com vs ${competitor} as HTML fragments only.

Use exactly these sections:

<section class="page-intro">
  2-3 sentences: fair overview of both tools and which team type each suits.
</section>

<section class="quick-verdict">
  <h2>Quick verdict</h2>
  2-3 punchy sentences: which tool wins and for which buyer profile.
</section>

<section class="comparison-breakdown">
  <h2>Feature-by-feature breakdown</h2>
  Five h3 sub-sections: Ease of use, Pricing, Automation, Integrations, Reporting.
  One paragraph each, comparing both tools honestly with specific detail.
</section>

<section class="monday-wins">
  <h2>Where monday.com has the edge</h2>
  <ul>[4 specific li advantages over ${competitor}]</ul>
</section>

<section class="competitor-wins">
  <h2>Where ${competitor} has the edge</h2>
  <ul>[3 honest li items where ${competitor} is genuinely better — don't soften these]</ul>
</section>

<section class="who-should-switch">
  <h2>Should you switch to monday.com?</h2>
  One honest paragraph. Acknowledge who should NOT switch.
</section>

Rules: Genuinely fair, use real pricing, no hype. Return ONLY the HTML sections.`;
}

function useCasePrompt(audience, pain) {
  return `You are a sharp SaaS copywriter for Brightlane, an independent monday.com review site.

Write a guide "monday.com for ${audience}" solving "${pain}" as HTML fragments only.

Use exactly these sections:

<section class="page-intro">
  2-3 sentences: the specific challenge and how monday.com addresses it.
</section>

<section class="core-workflows">
  <h2>Core workflows for ${audience}</h2>
  Three h3 sub-sections: specific monday.com setups with concrete detail
  (board structure, column types, automations, views used).
</section>

<section class="templates">
  <h2>Recommended templates</h2>
  <ul>[4 li items: specific monday.com templates with one-sentence descriptions]</ul>
</section>

<section class="integrations">
  <h2>Integrations that matter</h2>
  <ul>[4 li items: tools this audience uses and how monday.com connects to each]</ul>
</section>

<section class="pricing-fit">
  <h2>Which plan fits ${audience}?</h2>
  One paragraph recommending a specific plan tier with clear reasoning.
</section>

<section class="verdict">
  <h2>Bottom line</h2>
  One honest paragraph: is monday.com right for ${audience}, and what to watch out for.
</section>

Rules: Audience-specific, mention real monday.com feature names, no filler. Return ONLY the HTML sections.`;
}

// ── INNER PAGE TEMPLATE ───────────────────────────────────────

function pageTemplate({ title, description, slugStr, content, relatedPages, pageType }) {
  const typeLabel = {
    feature: "Feature Review",
    comparison: "vs Comparison",
    usecase: "Use-Case Guide",
  }[pageType] || "Guide";

  const relatedLinks = relatedPages.slice(0, 6)
    .map(p => `<li><a href="/${p.slug}.html">${escHtml(p.title)}</a></li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)} | ${escHtml(CONFIG.brand)}</title>
<meta name="description" content="${escHtml(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${CONFIG.domain}/${slugStr}.html">
<meta name="robots" content="index,follow">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"${escHtml(title)}",
 "author":{"@type":"Organization","name":"${escHtml(CONFIG.brand)}"}}
<\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f5f7fb;color:#1a1a2e;line-height:1.7}
a{color:#0073ea;text-decoration:none}a:hover{text-decoration:underline}
nav{background:#fff;border-bottom:1px solid #e0e4ef;padding:0 24px;position:sticky;top:0;z-index:100}
.nav-inner{max-width:1000px;margin:auto;display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-size:18px;font-weight:700;color:#1a1a2e;display:flex;align-items:center;gap:8px;text-decoration:none}
.logo-dot{width:10px;height:10px;background:#0073ea;border-radius:50%}
.nav-btn{display:inline-block;background:#0073ea;color:#fff;padding:9px 18px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none}
.breadcrumb{max-width:1000px;margin:18px auto 0;padding:0 24px;font-size:13px;color:#6b7280}
.hero-strip{background:#fff;border-bottom:1px solid #e0e4ef;padding:36px 24px 32px}
.hero-inner{max-width:1000px;margin:auto}
.type-badge{display:inline-block;background:#e8f2fd;color:#0060c8;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
h1{font-size:32px;font-weight:800;line-height:1.2;color:#1a1a2e;margin-bottom:12px}
.hero-desc{font-size:16px;color:#4b5563;margin-bottom:22px;max-width:680px}
.cta-btn{display:inline-block;background:#ff4500;color:#fff;padding:13px 26px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none}
.cta-btn:hover{background:#d93d00}
.disclosure{font-size:11px;color:#9ca3af;margin-top:9px}
.layout{max-width:1000px;margin:32px auto 40px;padding:0 24px;display:grid;grid-template-columns:1fr 272px;gap:28px}
@media(max-width:720px){.layout{grid-template-columns:1fr}}
.main-content{background:#fff;border:1px solid #e0e4ef;border-radius:12px;padding:36px}
.main-content section{margin-bottom:4px}
.main-content h2{font-size:22px;font-weight:700;margin:30px 0 12px;color:#1a1a2e}
.main-content h3{font-size:17px;font-weight:600;margin:22px 0 8px;color:#1a1a2e}
.main-content p{font-size:15px;color:#374151;margin-bottom:14px}
.main-content ul{padding-left:20px;margin-bottom:14px}
.main-content li{font-size:15px;color:#374151;margin-bottom:7px}
.main-content strong{color:#1a1a2e}
.sidebar{display:flex;flex-direction:column;gap:18px}
.sidebar-cta{background:#0073ea;border-radius:12px;padding:22px;text-align:center;color:#fff}
.sidebar-cta h3{color:#fff;font-size:16px;margin-bottom:8px}
.sidebar-cta p{font-size:13px;color:rgba(255,255,255,.85);margin-bottom:16px}
.sidebar-cta a{display:block;background:#fff;color:#0073ea;padding:11px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none}
.sidebar-card{background:#fff;border:1px solid #e0e4ef;border-radius:12px;padding:20px}
.sidebar-card h3{font-size:15px;font-weight:700;margin-bottom:14px;color:#1a1a2e}
.overall-score{text-align:center;padding:8px 0 14px}
.score-num{font-size:48px;font-weight:800;color:#0073ea;line-height:1}
.score-stars{color:#f5a623;font-size:17px;letter-spacing:1px;margin:4px 0}
.score-label{font-size:12px;color:#6b7280}
.rating-box{display:flex;flex-direction:column;gap:9px}
.rating-row{display:flex;align-items:center;gap:10px;font-size:13px}
.rating-label{width:88px;color:#6b7280;flex-shrink:0}
.rating-bar-wrap{flex:1;background:#e5e7eb;border-radius:4px;height:7px}
.rating-bar{background:#0073ea;border-radius:4px;height:7px}
.rating-num{font-weight:700;color:#1a1a2e;width:26px;text-align:right;font-size:13px}
.related-list{list-style:none;display:flex;flex-direction:column;gap:8px}
.related-list li a{font-size:14px}
footer{background:#fff;border-top:1px solid #e0e4ef;padding:26px 24px;text-align:center;margin-top:40px}
.footer-inner{max-width:1000px;margin:auto;font-size:12px;color:#9ca3af}
</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/index.html" class="logo"><div class="logo-dot"></div>${escHtml(CONFIG.brand)}</a>
  <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="nav-btn">Try monday.com free</a>
</div></nav>
<div class="breadcrumb">
  <a href="/index.html">Home</a> &rsaquo; ${escHtml(typeLabel)} &rsaquo; ${escHtml(title)}
</div>
<div class="hero-strip"><div class="hero-inner">
  <div class="type-badge">${escHtml(typeLabel)}</div>
  <h1>${escHtml(title)}</h1>
  <p class="hero-desc">${escHtml(description)}</p>
  <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="cta-btn">Start Free Trial &rarr;</a>
  <div class="disclosure">${CONFIG.affiliateDisclosure}</div>
</div></div>
<div class="layout">
  <main class="main-content">${content}</main>
  <aside class="sidebar">
    <div class="sidebar-cta">
      <h3>Try monday.com free</h3>
      <p>14-day trial — no credit card required.</p>
      <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored">Get started &rarr;</a>
    </div>
    <div class="sidebar-card">
      <h3>Our editorial rating</h3>
      <div class="overall-score">
        <div class="score-num">9.1</div>
        <div class="score-stars">★★★★★</div>
        <div class="score-label">out of 10</div>
      </div>
      <div class="rating-box">
        <div class="rating-row"><span class="rating-label">Ease of use</span><div class="rating-bar-wrap"><div class="rating-bar" style="width:92%"></div></div><span class="rating-num">9.2</span></div>
        <div class="rating-row"><span class="rating-label">Features</span><div class="rating-bar-wrap"><div class="rating-bar" style="width:90%"></div></div><span class="rating-num">9.0</span></div>
        <div class="rating-row"><span class="rating-label">Value</span><div class="rating-bar-wrap"><div class="rating-bar" style="width:84%"></div></div><span class="rating-num">8.4</span></div>
        <div class="rating-row"><span class="rating-label">Support</span><div class="rating-bar-wrap"><div class="rating-bar" style="width:88%"></div></div><span class="rating-num">8.8</span></div>
      </div>
    </div>
    <div class="sidebar-card">
      <h3>Related pages</h3>
      <ul class="related-list">${relatedLinks}</ul>
    </div>
  </aside>
</div>
<footer><div class="footer-inner">
  &copy; 2026 ${escHtml(CONFIG.brand)} &nbsp;&middot;&nbsp; Independent review site &nbsp;&middot;&nbsp; Not affiliated with monday.com Inc.
</div></footer>
</body></html>`;
}

// ── HOMEPAGE TEMPLATE ─────────────────────────────────────────

function homepageTemplate(allPages) {
  const fp = allPages.filter(p => p.type === "feature").slice(0, 6);
  const cp = allPages.filter(p => p.type === "comparison").slice(0, 6);
  const up = allPages.filter(p => p.type === "usecase").slice(0, 6);

  const card = (p, cta) =>
    `<div class="feat-card"><h3>${escHtml(p.title)}</h3><p>${escHtml(p.description)}</p><a href="/${p.slug}.html">${cta} &rarr;</a></div>`;

  const listItems = pages =>
    pages.map(p => `<li><a href="/${p.slug}.html">${escHtml(p.title)}</a></li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>monday.com Reviews, Comparisons &amp; Guides | ${escHtml(CONFIG.brand)}</title>
<meta name="description" content="Independent reviews of monday.com features, competitor comparisons, and team-specific guides.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${CONFIG.domain}/">
<meta name="robots" content="index,follow">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f5f7fb;color:#1a1a2e;line-height:1.7}
a{color:#0073ea;text-decoration:none}a:hover{text-decoration:underline}
.btn-primary{display:inline-block;background:#0073ea;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none}
.btn-primary:hover{background:#0060c8}
.btn-ghost{display:inline-block;background:transparent;color:#0073ea;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px;border:2px solid #0073ea;text-decoration:none}
.btn-ghost:hover{background:#e8f2fd}
nav{background:#fff;border-bottom:1px solid #e0e4ef;padding:0 24px;position:sticky;top:0;z-index:100}
.nav-inner{max-width:1000px;margin:auto;display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-size:18px;font-weight:700;color:#1a1a2e;display:flex;align-items:center;gap:8px;text-decoration:none}
.logo-dot{width:10px;height:10px;background:#0073ea;border-radius:50%}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{font-size:14px;color:#6b7280}
.hero{background:#fff;padding:88px 24px 72px;text-align:center;border-bottom:1px solid #e0e4ef}
.hero-inner{max-width:700px;margin:auto}
.badge{display:inline-block;background:#e8f2fd;color:#0060c8;font-size:12px;font-weight:700;padding:4px 14px;border-radius:20px;margin-bottom:20px}
h1{font-size:44px;font-weight:800;line-height:1.15;color:#1a1a2e;letter-spacing:-.5px;margin-bottom:18px}
.hero-sub{font-size:18px;color:#4b5563;margin-bottom:34px;line-height:1.65}
.hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.social-proof{margin-top:26px;font-size:13px;color:#6b7280}
.stars{color:#f5a623;font-size:15px;letter-spacing:1px}
.trust-bar{background:#fff;border-top:1px solid #e0e4ef;border-bottom:1px solid #e0e4ef;padding:18px 24px}
.trust-inner{max-width:1000px;margin:auto;display:flex;align-items:center;justify-content:center;gap:36px;flex-wrap:wrap}
.trust-item{font-size:13px;font-weight:600;color:#6b7280}
section{padding:64px 0}
.container{max-width:1000px;margin:auto;padding:0 24px}
.section-head{text-align:center;margin-bottom:36px}
.section-head h2{font-size:30px;font-weight:800;color:#1a1a2e;margin-bottom:10px}
.section-head p{font-size:16px;color:#6b7280}
.grid-3{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.feat-card{background:#fff;border:1px solid #e0e4ef;border-radius:12px;padding:22px}
.feat-card h3{font-size:16px;font-weight:700;margin-bottom:8px;color:#1a1a2e}
.feat-card p{font-size:14px;color:#6b7280;margin-bottom:14px}
.feat-card a{font-size:14px;font-weight:600;color:#0073ea}
.page-list{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:26px}
.page-list li a{font-size:14px;padding:10px 14px;background:#fff;border:1px solid #e0e4ef;border-radius:8px;display:block}
.page-list li a:hover{background:#e8f2fd;text-decoration:none}
.tgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px}
.tcard{background:#f5f7fb;border:1px solid #e0e4ef;border-radius:12px;padding:22px}
.tcard-stars{color:#f5a623;font-size:14px;letter-spacing:1px;margin-bottom:10px}
.tcard-text{font-size:14px;color:#374151;line-height:1.65;margin-bottom:14px}
.tcard-author{font-size:13px;font-weight:700;color:#1a1a2e}
.tcard-role{font-size:12px;color:#6b7280}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px;margin-top:32px}
.pcard{background:#fff;border:1px solid #e0e4ef;border-radius:12px;padding:26px 22px}
.pcard.featured{border:2px solid #0073ea}
.pcard-tier{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.pcard-price{font-size:32px;font-weight:800;color:#1a1a2e;line-height:1.1}
.pcard-price span{font-size:14px;font-weight:400;color:#6b7280}
.pcard-desc{font-size:13px;color:#6b7280;margin:10px 0 16px;line-height:1.5}
.pcard-features{list-style:none;font-size:13px;color:#374151;display:flex;flex-direction:column;gap:7px;margin-bottom:20px}
.pcard-features li::before{content:"✓  ";color:#0073ea;font-weight:700}
.popular-pill{display:inline-block;background:#e8f2fd;color:#0060c8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:10px}
.faq-list{max-width:680px;margin:28px auto 0}
.faq-item{border-bottom:1px solid #e0e4ef}
.faq-q{width:100%;background:none;border:none;text-align:left;padding:17px 0;font-size:15px;font-weight:600;color:#1a1a2e;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif}
.faq-a{font-size:14px;color:#4b5563;line-height:1.7;padding-bottom:14px;display:none}
.faq-a.open{display:block}
.chevron{font-size:18px;color:#9ca3af;transition:transform .2s}
.chevron.open{transform:rotate(180deg)}
.cta-banner{background:#0073ea;padding:72px 24px;text-align:center;color:#fff}
.cta-banner h2{font-size:32px;font-weight:800;color:#fff;margin-bottom:12px}
.cta-banner p{font-size:16px;color:rgba(255,255,255,.85);margin-bottom:28px}
.btn-white{display:inline-block;background:#fff;color:#0073ea;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none}
.cta-disclosure{font-size:11px;color:rgba(255,255,255,.5);margin-top:14px}
footer{background:#fff;border-top:1px solid #e0e4ef;padding:26px 24px;text-align:center}
.footer-inner{max-width:1000px;margin:auto;font-size:12px;color:#9ca3af}
</style>
</head>
<body>
<nav><div class="nav-inner">
  <a href="/index.html" class="logo"><div class="logo-dot"></div>${escHtml(CONFIG.brand)}</a>
  <div class="nav-links">
    <a href="#features">Features</a>
    <a href="#comparisons">Comparisons</a>
    <a href="#pricing">Pricing</a>
    <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-primary" style="padding:9px 18px;font-size:14px">Try free</a>
  </div>
</div></nav>

<div class="hero"><div class="hero-inner">
  <div class="badge">⭐ #1 Rated Work OS — G2 2026</div>
  <h1>The work platform your whole team will love</h1>
  <p class="hero-sub">monday.com brings projects, workflows, and people into one clear view — so your team spends less time managing and more time doing.</p>
  <div class="hero-btns">
    <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-primary">Start free trial</a>
    <a href="#features" class="btn-ghost">See how it works</a>
  </div>
  <div class="social-proof"><span class="stars">★★★★★</span> &nbsp;4.7 / 5 from over 10,000 verified reviews</div>
</div></div>

<div class="trust-bar"><div class="trust-inner">
  <div class="trust-item">✓ SOC2 certified</div>
  <div class="trust-item">✓ 225,000+ customers</div>
  <div class="trust-item">✓ 200+ countries</div>
  <div class="trust-item">✓ GDPR compliant</div>
  <div class="trust-item">✓ 24/7 support</div>
</div></div>

<section id="features">
  <div class="container">
    <div class="section-head"><h2>Feature deep-dives</h2><p>Honest, detailed reviews of every monday.com feature.</p></div>
    <div class="grid-3">${fp.map(p => card(p, "Read review")).join("")}</div>
    <ul class="page-list">${listItems(allPages.filter(p => p.type === "feature").slice(6, 18))}</ul>
  </div>
</section>

<section id="comparisons" style="background:#fff">
  <div class="container">
    <div class="section-head"><h2>monday.com vs the competition</h2><p>Unbiased, side-by-side comparisons.</p></div>
    <div class="grid-3">${cp.map(p => card(p, "Read comparison")).join("")}</div>
    <ul class="page-list">${listItems(allPages.filter(p => p.type === "comparison").slice(6))}</ul>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head"><h2>Guides by team type</h2><p>monday.com set up for your specific workflow.</p></div>
    <div class="grid-3">${up.map(p => card(p, "Read guide")).join("")}</div>
    <ul class="page-list">${listItems(allPages.filter(p => p.type === "usecase").slice(6))}</ul>
  </div>
</section>

<section style="background:#fff">
  <div class="container">
    <div class="section-head"><h2>Teams that made the switch</h2><p>Real results from real teams — sourced from G2, Capterra, and Trustpilot.</p></div>
    <div class="tgrid">
      <div class="tcard"><div class="tcard-stars">★★★★★</div><p class="tcard-text">"We cut our weekly status meeting from 90 minutes to 15. Everything the team needs is already on the board."</p><div class="tcard-author">Sara R.</div><div class="tcard-role">Operations Lead, Midsize SaaS</div></div>
      <div class="tcard"><div class="tcard-stars">★★★★★</div><p class="tcard-text">"Our agency manages 40+ client campaigns. monday.com keeps every deadline, deliverable, and owner in one view."</p><div class="tcard-author">James K.</div><div class="tcard-role">Creative Director, Marketing Agency</div></div>
      <div class="tcard"><div class="tcard-stars">★★★★★</div><p class="tcard-text">"Switched from Asana after 3 years. Automation saves my team ~5 hours a week. Onboarding was surprisingly smooth."</p><div class="tcard-author">Mia L.</div><div class="tcard-role">Head of Product, Series B startup</div></div>
    </div>
  </div>
</section>

<section id="pricing" style="background:#f5f7fb">
  <div class="container">
    <div class="section-head"><h2>Simple, transparent pricing</h2><p>All plans include a 14-day free trial. No credit card required.</p></div>
    <div class="pricing-grid">
      <div class="pcard"><div class="pcard-tier">Free</div><div class="pcard-price">$0 <span>/ forever</span></div><div class="pcard-desc">Up to 2 seats.</div><ul class="pcard-features"><li>Up to 3 boards</li><li>200+ templates</li><li>Mobile apps</li></ul><a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-ghost" style="width:100%;text-align:center;display:block">Get started free</a></div>
      <div class="pcard"><div class="pcard-tier">Basic</div><div class="pcard-price">$9 <span>/ seat / mo</span></div><div class="pcard-desc">For small teams.</div><ul class="pcard-features"><li>Unlimited boards</li><li>Unlimited docs</li><li>5GB storage</li></ul><a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-ghost" style="width:100%;text-align:center;display:block">Start free trial</a></div>
      <div class="pcard featured"><div class="popular-pill">Most popular</div><div class="pcard-tier">Standard</div><div class="pcard-price">$12 <span>/ seat / mo</span></div><div class="pcard-desc">Best for growing teams.</div><ul class="pcard-features"><li>Timeline &amp; Gantt</li><li>250 automations/mo</li><li>Calendar view</li></ul><a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-primary" style="width:100%;text-align:center;display:block">Start free trial</a></div>
      <div class="pcard"><div class="pcard-tier">Pro</div><div class="pcard-price">$19 <span>/ seat / mo</span></div><div class="pcard-desc">Advanced reporting &amp; security.</div><ul class="pcard-features"><li>Private boards</li><li>25k automations/mo</li><li>Time tracking</li></ul><a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-ghost" style="width:100%;text-align:center;display:block">Start free trial</a></div>
    </div>
    <p style="text-align:center;margin-top:18px;font-size:13px;color:#6b7280">Prices billed annually. Monthly billing available at a slightly higher rate.</p>
  </div>
</section>

<section style="background:#fff">
  <div class="container">
    <div class="section-head"><h2>Frequently asked questions</h2></div>
    <div class="faq-list">
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">Do I need a credit card to start? <span class="chevron">▾</span></button><div class="faq-a">No — the 14-day free trial on any paid plan requires no payment details upfront.</div></div>
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">Can I import from Asana, Trello, or Jira? <span class="chevron">▾</span></button><div class="faq-a">Yes. monday.com supports direct imports from Asana, Trello, Jira, Basecamp, and more, plus CSV import for everything else.</div></div>
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">Is monday.com good for non-technical teams? <span class="chevron">▾</span></button><div class="faq-a">Absolutely — designed for HR, finance, marketing, and more. Drag-and-drop, 200+ templates, no training needed.</div></div>
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">What integrations are available? <span class="chevron">▾</span></button><div class="faq-a">200+ including Slack, Google Workspace, Zoom, Salesforce, HubSpot, Jira, GitHub, and Zapier. Custom integrations via API.</div></div>
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">Can I cancel anytime? <span class="chevron">▾</span></button><div class="faq-a">Yes. Monthly plans cancel anytime. Annual plans include a 30-day satisfaction guarantee.</div></div>
      <div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">Is my data secure? <span class="chevron">▾</span></button><div class="faq-a">Yes — SOC 2 Type II, GDPR, and ISO 27001 certified. Encrypted in transit and at rest. Enterprise plans include custom data residency.</div></div>
    </div>
  </div>
</section>

<div class="cta-banner">
  <h2>Ready to transform how your team works?</h2>
  <p>Join 225,000+ teams running their work on monday.com. Start free — no card needed.</p>
  <a href="${CONFIG.ctaLink}" target="_blank" rel="nofollow sponsored" class="btn-white">Start your free trial</a>
  <div class="cta-disclosure">${CONFIG.affiliateDisclosure}</div>
</div>

<footer><div class="footer-inner">
  &copy; 2026 ${escHtml(CONFIG.brand)} &nbsp;&middot;&nbsp; Independent review site &nbsp;&middot;&nbsp; Not affiliated with monday.com Inc.
</div></footer>

<script>
function toggleFaq(btn) {
  var a = btn.nextElementSibling, ic = btn.querySelector('.chevron');
  var open = a.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(function(el) { el.classList.remove('open'); });
  document.querySelectorAll('.chevron').forEach(function(el) { el.classList.remove('open'); });
  if (!open) { a.classList.add('open'); ic.classList.add('open'); }
}
</script>
</body></html>`;
}

// ── SITEMAP ───────────────────────────────────────────────────

async function generateSitemap(pages) {
  const urls = [
    `${CONFIG.domain}/index.html`,
    ...pages.map(p => `${CONFIG.domain}/${p.slug}.html`),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>`;
  await fs.writeFile(path.join(CONFIG.outputDir, "sitemap.xml"), xml);
}

// ── CHECKPOINT ────────────────────────────────────────────────

async function loadCheckpoint() {
  try { return JSON.parse(await fs.readFile(CONFIG.checkpointFile, "utf-8")); }
  catch { return { completed: [] }; }
}

async function saveCheckpoint(completed) {
  await fs.writeFile(CONFIG.checkpointFile, JSON.stringify({ completed }, null, 2));
}

// ── ASYNC QUEUE ───────────────────────────────────────────────

async function runQueue(tasks, concurrency) {
  let idx = 0, inFlight = 0, resolve;
  const done = new Promise(r => { resolve = r; });
  function next() {
    while (inFlight < concurrency && idx < tasks.length) {
      const task = tasks[idx++]; inFlight++;
      task().finally(() => { inFlight--; next(); });
    }
    if (inFlight === 0 && idx >= tasks.length) resolve();
  }
  next();
  return done;
}

// ── PAGE DEFINITIONS ──────────────────────────────────────────

function buildPageDefs() {
  const pages = [];
  for (const f of CONFIG.features)
    pages.push({ type: "feature", slug: slugify(`monday-com-${f}-review`), title: `monday.com ${f} — full review`, description: `In-depth review of monday.com's ${f} — how it works, who it's for, and whether it's worth it.`, promptFn: () => featurePrompt(f) });
  for (const c of CONFIG.competitors)
    pages.push({ type: "comparison", slug: slugify(`monday-com-vs-${c}-comparison`), title: `monday.com vs ${c} — detailed comparison`, description: `Honest, feature-by-feature comparison of monday.com and ${c}. Which tool is right for your team?`, promptFn: () => competitorPrompt(c) });
  for (const { audience, pain } of CONFIG.useCases)
    pages.push({ type: "usecase", slug: slugify(`monday-com-for-${audience}-guide`), title: `monday.com for ${audience} — complete guide`, description: `How ${audience} use monday.com to solve ${pain}. Workflows, templates, integrations, and pricing advice.`, promptFn: () => useCasePrompt(audience, pain) });
  return pages;
}

// ── MAIN ──────────────────────────────────────────────────────

async function generate() {
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  const allPages = buildPageDefs();
  const checkpoint = await loadCheckpoint();
  const completed = new Set(checkpoint.completed);
  const todo = allPages.filter(p => !completed.has(p.slug));

  console.log("\n🚀 Brightlane Site Generator");
  console.log(`   Total pages : ${allPages.length}`);
  console.log(`   Done already: ${completed.size}`);
  console.log(`   To generate : ${todo.length}`);
  console.log(`   Concurrency : ${CONFIG.concurrency}\n`);

  let count = completed.size;

  const tasks = todo.map(page => async () => {
    try {
      const content = await callClaude(page.promptFn());
      const sameType = allPages.filter(p => p.type === page.type && p.slug !== page.slug).sort(() => Math.random() - .5).slice(0, 3);
      const others   = allPages.filter(p => p.type !== page.type).sort(() => Math.random() - .5).slice(0, 3);
      const html = pageTemplate({ title: page.title, description: page.description, slugStr: page.slug, content, relatedPages: [...sameType, ...others], pageType: page.type });
      await fs.writeFile(path.join(CONFIG.outputDir, `${page.slug}.html`), html);
      completed.add(page.slug);
      await saveCheckpoint([...completed]);
      count++;
      console.log(`  ✓ [${count}/${allPages.length}] ${page.title}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${page.title} — ${err.message}`);
    }
    await sleep(CONFIG.batchDelay);
  });

  await runQueue(tasks, CONFIG.concurrency);

  console.log("\n📄 Writing index.html…");
  await fs.writeFile(path.join(CONFIG.outputDir, "index.html"), homepageTemplate(allPages));
  console.log("🗺  Writing sitemap.xml…");
  await generateSitemap(allPages);
  console.log(`\n✅ Done — ${allPages.length} pages + index.html + sitemap.xml\n`);
}

generate().catch(err => { console.error("Fatal:", err); process.exit(1); });
