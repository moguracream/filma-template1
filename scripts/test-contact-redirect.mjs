import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../assets/js/contact-redirect.mjs", import.meta.url);

async function loadModule() {
  return import(moduleUrl.href);
}

test("routes every LP inquiry CTA through /contact with a stable flow code", async () => {
  const pages = [
    {
      path: new URL("../index.html", import.meta.url),
      flows: ["developer_header", "developer_hero", "developer_footer"],
    },
    {
      path: new URL("../lp/ip/index.html", import.meta.url),
      flows: ["ip_header", "ip_hero", "ip_footer"],
    },
    {
      path: new URL("../lp/elearning/index.html", import.meta.url),
      flows: ["elearning_header", "elearning_hero", "elearning_footer"],
    },
  ];

  for (const page of pages) {
    const html = await readFile(page.path, "utf8");
    assert.equal(
      html.split("data-contact-link").length - 1,
      page.flows.length,
      `${page.path.pathname} must mark every inquiry CTA for attribution`,
    );
    assert.ok(
      html.includes("G-1KZJ2QN1S7"),
      `${page.path.pathname} must load the Filma GA4 property`,
    );
    for (const flow of page.flows) {
      assert.ok(
        html.includes(`href="/contact/?contact_flow=${flow}" data-contact-link`),
        `${page.path.pathname} is missing contact flow ${flow}`,
      );
    }
  }
});

test("accepts only known LP flow codes and safe traffic context", async () => {
  const { sanitizeContactContext } = await loadModule();
  const valid = sanitizeContactContext(
    "?contact_flow=ip_hero&contact_source=prtimes.jp&contact_medium=referral&contact_market=general&email=person%40example.com",
  );

  assert.deepEqual(valid.values, {
    contact_flow: "ip_hero",
    contact_source: "prtimes.jp",
    contact_medium: "referral",
    contact_market: "general",
  });
  assert.equal(valid.lp, "ip");
  assert.equal(valid.cta, "hero");
  assert.equal(valid.params.has("email"), false);

  const invalid = sanitizeContactContext(
    "?contact_flow=unknown_footer&contact_source=https%3A%2F%2Fevil.example%2Fx&contact_medium=paid%20search&contact_market=private",
  );
  assert.deepEqual(invalid.values, {});
});

test("builds a sheet-readable management code from LP and acquisition data", async () => {
  const {
    buildContactManagementCode,
    sanitizeAttribution,
    sanitizeContactContext,
  } = await loadModule();
  const attribution = sanitizeAttribution(
    "?utm_source=google&utm_medium=cpc&utm_campaign=filma_search_general_202609_drm&utm_content=responsive_ad_a",
  );
  const contact = sanitizeContactContext(
    "?contact_flow=elearning_footer&contact_source=google&contact_medium=cpc&contact_market=general",
  );

  assert.equal(
    buildContactManagementCode(contact, attribution),
    "lp=elearning|cta=footer|source=google|medium=cpc|campaign=filma_search_general_202609_drm|content=responsive_ad_a|market=general",
  );
});

test("keeps valid manual campaign parameters and Google click IDs", async () => {
  const { sanitizeAttribution } = await loadModule();
  const result = sanitizeAttribution(
    "?utm_source=google&utm_medium=cpc&utm_campaign=filma_search_general_202609_drm&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&gbraid=GBR.456&wbraid=WBR~789&dclid=DCL_123&gclsrc=aw.ds&gad_source=1&gad_campaignid=1234567890&email=person%40example.com&next=https%3A%2F%2Fevil.example",
  );

  assert.deepEqual(result.utm, {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "filma_search_general_202609_drm",
    utm_content: "responsive_ad_a",
    utm_id: "search_001",
    utm_term: "video_drm",
    utm_source_platform: "google_ads",
  });
  assert.deepEqual(result.clickIds, {
    gclid: "AbC_123-xy",
    gbraid: "GBR.456",
    wbraid: "WBR~789",
    dclid: "DCL_123",
    gclsrc: "aw.ds",
    gad_source: "1",
    gad_campaignid: "1234567890",
  });
  assert.equal(result.flowCode, "responsive_ad_a");
  assert.equal(result.params.has("email"), false);
  assert.equal(result.params.has("next"), false);
});

test("rejects malformed and overlong values without blocking valid attribution", async () => {
  const { sanitizeAttribution } = await loadModule();
  const overlongUtm = "a".repeat(101);
  const overlongClickId = "b".repeat(513);
  const result = sanitizeAttribution(
    `?utm_source=google&utm_medium=paid%20search&utm_campaign=${overlongUtm}&utm_content=creative%2Fone&gclid=${overlongClickId}&gbraid=Valid_123`,
  );

  assert.deepEqual(result.utm, { utm_source: "google" });
  assert.deepEqual(result.clickIds, { gbraid: "Valid_123" });
  assert.equal(result.flowCode, "");
  assert.equal(result.params.toString(), "utm_source=google&gbraid=Valid_123");
});

test("keeps only the first value for duplicate allowlisted parameters", async () => {
  const { sanitizeAttribution } = await loadModule();
  const result = sanitizeAttribution(
    "?utm_source=google&utm_source=spoofed&gclid=FirstValue&gclid=SecondValue",
  );

  assert.equal(result.params.get("utm_source"), "google");
  assert.equal(result.params.getAll("utm_source").length, 1);
  assert.equal(result.params.get("gclid"), "FirstValue");
  assert.equal(result.params.getAll("gclid").length, 1);
});

test("does not retain disabled platform click IDs unless explicitly enabled", async () => {
  const { sanitizeAttribution, DEFAULT_CLICK_ID_NAMES } = await loadModule();
  const query = "?utm_source=bing&utm_medium=cpc&msclkid=MsClick_123&fbclid=FbClick_456";

  const defaultResult = sanitizeAttribution(query);
  assert.deepEqual(defaultResult.clickIds, {});

  const enabledResult = sanitizeAttribution(query, [
    ...DEFAULT_CLICK_ID_NAMES,
    "msclkid",
    "fbclid",
  ]);
  assert.deepEqual(enabledResult.clickIds, {
    msclkid: "MsClick_123",
    fbclid: "FbClick_456",
  });
});

test("preserves each CTA flow code while carrying valid acquisition data", async () => {
  const { preserveAttributionOnContactLinks } = await loadModule();
  const links = ["header", "hero", "footer"].map((cta) => ({
    href: `https://docs.filma.biz/contact/?contact_flow=developer_${cta}`,
  }));
  const document = {
    referrer: "https://www.google.com/search?q=filma",
    querySelectorAll(selector) {
      assert.equal(selector, "[data-contact-link]");
      return links;
    },
  };

  preserveAttributionOnContactLinks({
    document,
    location: {
      href: "https://docs.filma.biz/",
      hostname: "docs.filma.biz",
      search:
        "?utm_source=google&utm_medium=cpc&utm_campaign=filma_sales_general_202608&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&gad_source=1&gad_campaignid=1234567890&email=person%40example.com&next=https%3A%2F%2Fevil.example",
    },
  });

  assert.deepEqual(
    links.map((link) => link.href),
    ["header", "hero", "footer"].map(
      (cta) =>
        `https://docs.filma.biz/contact/?contact_flow=developer_${cta}&contact_source=google&contact_medium=cpc&contact_market=general&utm_source=google&utm_medium=cpc&utm_campaign=filma_sales_general_202608&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&gad_source=1&gad_campaignid=1234567890`,
    ),
  );
});

test("keeps the original external referrer across internal LP navigation", async () => {
  const { preserveAttributionOnContactLinks } = await loadModule();
  const values = new Map();
  const sessionStorage = {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const firstLink = {
    href: "https://docs.filma.biz/contact/?contact_flow=ip_hero",
  };

  preserveAttributionOnContactLinks({
    document: {
      referrer: "https://prtimes.jp/main/html/rd/p/000000001.000000001.html",
      querySelectorAll() {
        return [firstLink];
      },
    },
    location: {
      href: "https://docs.filma.biz/lp/ip/",
      hostname: "docs.filma.biz",
      search: "",
    },
    sessionStorage,
  });

  assert.equal(new URL(firstLink.href).searchParams.get("contact_source"), "prtimes.jp");
  assert.equal(new URL(firstLink.href).searchParams.get("contact_medium"), "referral");

  const secondLink = {
    href: "https://docs.filma.biz/contact/?contact_flow=elearning_footer",
  };
  preserveAttributionOnContactLinks({
    document: {
      referrer: "https://docs.filma.biz/lp/ip/",
      querySelectorAll() {
        return [secondLink];
      },
    },
    location: {
      href: "https://docs.filma.biz/lp/elearning/",
      hostname: "docs.filma.biz",
      search: "",
    },
    sessionStorage,
  });

  assert.equal(new URL(secondLink.href).searchParams.get("contact_source"), "prtimes.jp");
  assert.equal(new URL(secondLink.href).searchParams.get("contact_medium"), "referral");
});

test("classifies Google Ads click IDs when manual UTM parameters are absent", async () => {
  const { preserveAttributionOnContactLinks } = await loadModule();
  const link = {
    href: "https://docs.filma.biz/contact/?contact_flow=developer_hero",
  };

  preserveAttributionOnContactLinks({
    document: {
      referrer: "",
      querySelectorAll() {
        return [link];
      },
    },
    location: {
      href: "https://docs.filma.biz/?gclid=GoogleClick_123",
      hostname: "docs.filma.biz",
      search: "?gclid=GoogleClick_123",
    },
  });

  const url = new URL(link.href);
  assert.equal(url.searchParams.get("contact_source"), "google");
  assert.equal(url.searchParams.get("contact_medium"), "cpc");
  assert.equal(url.searchParams.get("gclid"), "GoogleClick_123");
});

test("builds a sanitized page URL and a form URL that receives only the management code", async () => {
  const {
    buildFormUrl,
    buildSanitizedPageUrl,
    sanitizeAttribution,
  } = await loadModule();
  const result = sanitizeAttribution(
    "?utm_source=google&utm_medium=cpc&utm_content=responsive_ad_a&gclid=AbC_123-xy&next=https%3A%2F%2Fevil.example",
  );

  const pageUrl = buildSanitizedPageUrl(
    "https://docs.filma.biz/contact/?old=value#fragment",
    result.params,
  );
  assert.equal(
    pageUrl,
    "https://docs.filma.biz/contact/?utm_source=google&utm_medium=cpc&utm_content=responsive_ad_a&gclid=AbC_123-xy",
  );

  const formUrl = buildFormUrl(
    "https://docs.google.com/forms/d/e/form-id/viewform?unexpected=value",
    "entry.1442019456",
    result.flowCode,
  );
  assert.equal(
    formUrl,
    "https://docs.google.com/forms/d/e/form-id/viewform?usp=pp_url&entry.1442019456=responsive_ad_a",
  );
  assert.equal(formUrl.includes("utm_source="), false);
  assert.equal(formUrl.includes("gclid="), false);
  assert.equal(formUrl.includes("next="), false);
});

test("omits the management code when utm_content is absent", async () => {
  const { buildFormUrl } = await loadModule();
  const formUrl = buildFormUrl(
    "https://docs.google.com/forms/d/e/form-id/viewform",
    "entry.1442019456",
    "",
  );

  assert.equal(
    formUrl,
    "https://docs.google.com/forms/d/e/form-id/viewform?usp=pp_url",
  );
});

function createBrowserHarness(search) {
  const order = [];
  const gtagCalls = [];
  const timerCallbacks = [];
  const replacedLocations = [];
  const manualLink = { href: "" };
  const location = {
    href: `https://docs.filma.biz/contact/${search}`,
    search,
    replace(url) {
      order.push("location.replace");
      replacedLocations.push(url);
    },
  };
  const history = {
    replaceState(_state, _title, url) {
      order.push("history.replaceState");
      location.href = url;
      location.search = new URL(url).search;
    },
  };
  const document = {
    head: {
      append(script) {
        order.push("document.head.append");
        assert.equal(script.async, true);
        assert.equal(
          script.src,
          "https://www.googletagmanager.com/gtag/js?id=G-1KZJ2QN1S7",
        );
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "script");
      return { async: false, src: "" };
    },
    getElementById(id) {
      assert.equal(id, "manual-contact-link");
      return manualLink;
    },
  };
  const dataLayer = {
    push(args) {
      const call = Array.from(args);
      gtagCalls.push(call);
      const suffix = call[0] === "js" || !call[1] ? "" : `.${call[1]}`;
      order.push(`gtag.${call[0]}${suffix}`);
    },
  };
  const window = {
    dataLayer,
    setTimeout(callback, delay) {
      order.push("window.setTimeout");
      assert.equal(delay, 1000);
      timerCallbacks.push(callback);
      return timerCallbacks.length;
    },
  };

  return {
    document,
    gtagCalls,
    history,
    location,
    manualLink,
    order,
    replacedLocations,
    timerCallbacks,
    window,
  };
}

test("initializes GA4 with the sanitized page URL before redirecting", async () => {
  const { startContactRedirect } = await loadModule();
  const harness = createBrowserHarness(
    "?contact_flow=ip_hero&contact_source=google&contact_medium=cpc&contact_market=general&utm_source=google&utm_medium=cpc&utm_campaign=filma_search_general_202609_drm&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&next=https%3A%2F%2Fevil.example",
  );

  const result = startContactRedirect({
    ...harness,
    measurementId: "G-1KZJ2QN1S7",
    formBaseUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSfTXvyTcaS_pHkpMvy8TqeNQpWhyQmFEopaFoI81n2swGNjmA/viewform",
    formEntryKey: "entry.1442019456",
    timeoutMs: 1000,
  });

  assert.equal(result.sanitizedPageUrl.includes("gclid=AbC_123-xy"), true);
  assert.equal(result.sanitizedPageUrl.includes("contact_flow=ip_hero"), true);
  assert.equal(result.sanitizedPageUrl.includes("next="), false);
  assert.equal(
    new URL(result.formUrl).searchParams.get("entry.1442019456"),
    "lp=ip|cta=hero|source=google|medium=cpc|campaign=filma_search_general_202609_drm|content=responsive_ad_a|market=general",
  );
  assert.equal(harness.manualLink.href, result.formUrl);
  assert.deepEqual(harness.order, [
    "history.replaceState",
    "document.head.append",
    "gtag.js",
    "gtag.config.G-1KZJ2QN1S7",
    "gtag.event.contact_redirect",
    "window.setTimeout",
  ]);
  assert.equal(harness.gtagCalls.length, 3);
  assert.equal(harness.gtagCalls[1][0], "config");
  assert.equal(harness.gtagCalls[1][1], "G-1KZJ2QN1S7");
  assert.equal(
    harness.gtagCalls[1][2].page_location,
    result.sanitizedPageUrl,
  );
  assert.equal(harness.gtagCalls[2][0], "event");
  assert.equal(harness.gtagCalls[2][1], "contact_redirect");
  assert.equal(harness.gtagCalls[2][2].contact_flow, "ip_hero");
  assert.equal(harness.gtagCalls[2][2].contact_lp, "ip");
  assert.equal(harness.gtagCalls[2][2].contact_cta, "hero");
  assert.equal(harness.gtagCalls[2][2].contact_source, "google");
  assert.equal(harness.gtagCalls[2][2].contact_medium, "cpc");
  assert.equal(
    harness.gtagCalls[2][2].contact_campaign,
    "filma_search_general_202609_drm",
  );
  assert.equal(harness.gtagCalls[2][2].contact_market, "general");
  assert.equal(harness.gtagCalls[2][2].event_timeout, 1000);
  assert.equal(harness.gtagCalls[2][2].transport_type, "beacon");
});

test("redirects only once when both GA4 callback and fallback timer run", async () => {
  const { startContactRedirect } = await loadModule();
  const harness = createBrowserHarness(
    "?utm_source=google&utm_medium=cpc&utm_content=responsive_ad_a&gclid=AbC_123-xy",
  );

  const result = startContactRedirect({
    ...harness,
    measurementId: "G-1KZJ2QN1S7",
    formBaseUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSfTXvyTcaS_pHkpMvy8TqeNQpWhyQmFEopaFoI81n2swGNjmA/viewform",
    formEntryKey: "entry.1442019456",
    timeoutMs: 1000,
  });
  const eventOptions = harness.gtagCalls[2][2];

  eventOptions.event_callback();
  harness.timerCallbacks[0]();
  result.redirect();

  assert.deepEqual(harness.replacedLocations, [result.formUrl]);
});

test("falls back to the timer when the Google tag never loads", async () => {
  const { startContactRedirect } = await loadModule();
  const harness = createBrowserHarness("?utm_source=referral");

  const result = startContactRedirect({
    ...harness,
    measurementId: "G-1KZJ2QN1S7",
    formBaseUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSfTXvyTcaS_pHkpMvy8TqeNQpWhyQmFEopaFoI81n2swGNjmA/viewform",
    formEntryKey: "entry.1442019456",
    timeoutMs: 1000,
  });

  harness.timerCallbacks[0]();

  assert.deepEqual(harness.replacedLocations, [result.formUrl]);
  assert.equal(result.formUrl.endsWith("?usp=pp_url"), true);
});
