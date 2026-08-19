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
]);

const UTM_VALUE_PATTERN = /^[A-Za-z0-9._-]+$/;
const CLICK_ID_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;
const FORM_ENTRY_KEY_PATTERN = /^entry\.\d+$/;

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

export function buildSanitizedPageUrl(currentUrl, params) {
  const url = new URL(currentUrl);
  url.search = params.toString();
  url.hash = "";
  return url.href;
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
  const sanitizedPageUrl = buildSanitizedPageUrl(
    location.href,
    attribution.params,
  );
  const formUrl = buildFormUrl(
    formBaseUrl,
    formEntryKey,
    attribution.flowCode,
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
    event_callback: redirect,
    event_timeout: timeoutMs,
    transport_type: "beacon",
  });
  window.setTimeout(redirect, timeoutMs);

  return {
    sanitizedPageUrl,
    formUrl,
    redirect,
  };
}
