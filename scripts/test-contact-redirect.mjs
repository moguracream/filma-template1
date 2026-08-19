import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../assets/js/contact-redirect.mjs", import.meta.url);

async function loadModule() {
  return import(moduleUrl.href);
}

test("keeps valid manual campaign parameters and Google click IDs", async () => {
  const { sanitizeAttribution } = await loadModule();
  const result = sanitizeAttribution(
    "?utm_source=google&utm_medium=cpc&utm_campaign=filma_search_general_202609_drm&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&gbraid=GBR.456&wbraid=WBR~789&dclid=DCL_123&gclsrc=aw.ds&email=person%40example.com&next=https%3A%2F%2Fevil.example",
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
    "?utm_source=google&utm_medium=cpc&utm_campaign=filma_search_general_202609_drm&utm_content=responsive_ad_a&utm_id=search_001&utm_term=video_drm&utm_source_platform=google_ads&gclid=AbC_123-xy&next=https%3A%2F%2Fevil.example",
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
  assert.equal(result.sanitizedPageUrl.includes("next="), false);
  assert.equal(
    result.formUrl,
    "https://docs.google.com/forms/d/e/1FAIpQLSfTXvyTcaS_pHkpMvy8TqeNQpWhyQmFEopaFoI81n2swGNjmA/viewform?usp=pp_url&entry.1442019456=responsive_ad_a",
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
