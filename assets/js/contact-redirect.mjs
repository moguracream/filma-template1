export const UTM_PARAMETER_NAMES = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_term",
  "utm_source_platform",
]);

export const DEFAULT_CLICK_ID_NAMES = Object.freeze([
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "gclsrc",
  "gad_source",
  "gad_campaignid",
]);

const UTM_VALUE_PATTERN = /^[A-Za-z0-9._-]+$/;
const CLICK_ID_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;
const FORM_ENTRY_KEY_PATTERN = /^entry\.\d+$/;
const CONTACT_FLOW_PATTERN = /^(developer|ip|elearning)_(header|hero|footer)$/;
const CONTACT_CONTEXT_VALUE_PATTERN = /^[A-Za-z0-9._-]+$/;
const CONTACT_MARKETS = new Set(["general", "special"]);
const ATTRIBUTION_STORAGE_KEY = "filma_contact_attribution_v1";

function copyValidValues(source, destination, names, pattern, maxLength) {
  const values = {};

  for (const name of names) {
    const value = source.get(name);
    if (!value || value.length > maxLength || !pattern.test(value)) continue;

    destination.set(name, value);
    values[name] = value;
  }

  return values;
}

export function sanitizeAttribution(
  search,
  enabledClickIdNames = DEFAULT_CLICK_ID_NAMES,
) {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams();
  const utm = copyValidValues(
    source,
    params,
    UTM_PARAMETER_NAMES,
    UTM_VALUE_PATTERN,
    100,
  );
  const clickIds = copyValidValues(
    source,
    params,
    enabledClickIdNames,
    CLICK_ID_VALUE_PATTERN,
    512,
  );

  return {
    params,
    utm,
    clickIds,
    flowCode: utm.utm_content || "",
  };
}

export function sanitizeContactContext(search) {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams();
  const values = {};

  const flow = source.get("contact_flow");
  if (flow && CONTACT_FLOW_PATTERN.test(flow)) {
    params.set("contact_flow", flow);
    values.contact_flow = flow;
  }

  for (const name of ["contact_source", "contact_medium"]) {
    const value = source.get(name);
    if (
      value &&
      value.length <= 100 &&
      CONTACT_CONTEXT_VALUE_PATTERN.test(value)
    ) {
      params.set(name, value);
      values[name] = value;
    }
  }

  const market = source.get("contact_market");
  if (market && CONTACT_MARKETS.has(market)) {
    params.set("contact_market", market);
    values.contact_market = market;
  }

  const [lp = "", cta = ""] = values.contact_flow?.split("_") || [];
  return { params, values, lp, cta };
}

function getExternalReferrerHost(document, location) {
  if (!document?.referrer) return "";

  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname === location.hostname) return "";
    return CONTACT_CONTEXT_VALUE_PATTERN.test(referrer.hostname)
      ? referrer.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function inferPaidClickTraffic(clickIds) {
  const googleClickNames = [
    "gclid",
    "gbraid",
    "wbraid",
    "dclid",
    "gad_source",
    "gad_campaignid",
  ];
  return googleClickNames.some((name) => clickIds[name])
    ? { source: "google", medium: "cpc" }
    : { source: "", medium: "" };
}

function readStoredAttribution(sessionStorage) {
  if (!sessionStorage) return null;

  try {
    const stored = JSON.parse(
      sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "null",
    );
    if (!stored || typeof stored.search !== "string") return null;

    const attribution = sanitizeAttribution(stored.search);
    const context = sanitizeContactContext(
      new URLSearchParams({
        contact_source: stored.source || "",
        contact_medium: stored.medium || "",
      }).toString(),
    );
    return {
      attribution,
      source: context.values.contact_source || "",
      medium: context.values.contact_medium || "",
    };
  } catch {
    return null;
  }
}

function storeAttribution(sessionStorage, attribution, source, medium) {
  if (!sessionStorage) return;

  try {
    sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        search: attribution.params.toString(),
        source,
        medium,
      }),
    );
  } catch {
    // Attribution still works for the current page when storage is unavailable.
  }
}

export function buildContactManagementCode(contact, attribution) {
  if (!contact.lp || !contact.cta) return attribution.flowCode;

  const source =
    attribution.utm.utm_source ||
    contact.values.contact_source ||
    "direct";
  const medium =
    attribution.utm.utm_medium ||
    contact.values.contact_medium ||
    (source === "direct" ? "none" : "referral");

  return [
    ["lp", contact.lp],
    ["cta", contact.cta],
    ["source", source],
    ["medium", medium],
    ["campaign", attribution.utm.utm_campaign || "none"],
    ["content", attribution.utm.utm_content || "none"],
    ["market", contact.values.contact_market || "general"],
  ]
    .map(([name, value]) => `${name}=${value}`)
    .join("|");
}

export function buildSanitizedPageUrl(currentUrl, params) {
  const url = new URL(currentUrl);
  url.search = params.toString();
  url.hash = "";
  return url.href;
}

export function preserveAttributionOnContactLinks({
  document,
  location,
  sessionStorage,
  enabledClickIdNames = DEFAULT_CLICK_ID_NAMES,
}) {
  let attribution = sanitizeAttribution(
    location.search,
    enabledClickIdNames,
  );
  const externalReferrer = getExternalReferrerHost(document, location);
  const paidClickTraffic = inferPaidClickTraffic(attribution.clickIds);
  let source =
    attribution.utm.utm_source ||
    paidClickTraffic.source ||
    externalReferrer;
  let medium =
    attribution.utm.utm_medium ||
    paidClickTraffic.medium ||
    (externalReferrer ? "referral" : "");

  if (!attribution.params.toString() && !externalReferrer) {
    const stored = readStoredAttribution(sessionStorage);
    if (stored) {
      attribution = stored.attribution;
      source = stored.source;
      medium = stored.medium;
    }
  } else {
    storeAttribution(sessionStorage, attribution, source, medium);
  }

  source ||= "direct";
  medium ||= source === "direct" ? "none" : "referral";

  for (const link of document.querySelectorAll("[data-contact-link]")) {
    const targetUrl = new URL(link.href, location.href);
    const contact = sanitizeContactContext(targetUrl.search);
    const params = new URLSearchParams(contact.params);
    params.set("contact_source", source);
    params.set("contact_medium", medium);
    params.set("contact_market", contact.values.contact_market || "general");
    for (const [name, value] of attribution.params) {
      params.set(name, value);
    }
    link.href = buildSanitizedPageUrl(targetUrl.href, params);
  }
}

export function buildFormUrl(baseUrl, entryKey, flowCode) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("usp", "pp_url");

  if (flowCode && FORM_ENTRY_KEY_PATTERN.test(entryKey)) {
    url.searchParams.set(entryKey, flowCode);
  }

  return url.href;
}

export function startContactRedirect({
  window,
  document,
  location,
  history,
  measurementId,
  formBaseUrl,
  formEntryKey,
  timeoutMs = 1000,
  enabledClickIdNames = DEFAULT_CLICK_ID_NAMES,
}) {
  const attribution = sanitizeAttribution(
    location.search,
    enabledClickIdNames,
  );
  const contact = sanitizeContactContext(location.search);
  const pageParams = new URLSearchParams(contact.params);
  for (const [name, value] of attribution.params) {
    pageParams.set(name, value);
  }
  const sanitizedPageUrl = buildSanitizedPageUrl(
    location.href,
    pageParams,
  );
  const managementCode = buildContactManagementCode(contact, attribution);
  const formUrl = buildFormUrl(
    formBaseUrl,
    formEntryKey,
    managementCode,
  );

  history.replaceState(null, "", sanitizedPageUrl);

  const manualLink = document.getElementById("manual-contact-link");
  if (manualLink) manualLink.href = formUrl;

  const googleTagScript = document.createElement("script");
  googleTagScript.async = true;
  googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(googleTagScript);

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  let redirected = false;
  const redirect = () => {
    if (redirected) return;
    redirected = true;
    location.replace(formUrl);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    page_location: sanitizedPageUrl,
  });
  window.gtag("event", "contact_redirect", {
    contact_flow: contact.values.contact_flow || "unknown",
    contact_lp: contact.lp || "unknown",
    contact_cta: contact.cta || "unknown",
    contact_source:
      attribution.utm.utm_source ||
      contact.values.contact_source ||
      "direct",
    contact_medium:
      attribution.utm.utm_medium ||
      contact.values.contact_medium ||
      "none",
    contact_campaign: attribution.utm.utm_campaign || "none",
    contact_market: contact.values.contact_market || "general",
    event_callback: redirect,
    event_timeout: timeoutMs,
    transport_type: "beacon",
  });
  window.setTimeout(redirect, timeoutMs);

  return {
    sanitizedPageUrl,
    formUrl,
    managementCode,
    redirect,
  };
}
