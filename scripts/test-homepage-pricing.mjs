import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const useCasePages = [
  {
    name: "e-learning",
    html: await readFile(new URL("../lp/elearning/index.html", import.meta.url), "utf8"),
  },
  {
    name: "IP content",
    html: await readFile(new URL("../lp/ip/index.html", import.meta.url), "utf8"),
  },
];

const expectedContent = [
  "DRMで守るべき動画コンテンツを配信する事業者へ",
  "<strong>Pro</strong> <span",
  "<td>12TB／年</td>",
  "<td>1TB</td>",
  "<td>50TB／年</td>",
  "<td>5TB</td>",
  "転送量 ＋5TB／年",
  "¥100,000",
  "¥80,000",
  "転送量 ＋10TB／年",
  "¥180,000",
  "¥150,000",
  "保存容量 ＋500GB",
  "¥60,000／年",
  "¥50,000／年",
  "保存容量 ＋1TB",
  "¥100,000／年",
  "¥80,000／年",
];

for (const content of expectedContent) {
  assert.ok(html.includes(content), `Missing homepage content: ${content}`);
}

assert.equal(
  html.match(
    /href="\/contact\/\?contact_flow=developer_(?:header|hero|footer)&amp;contact_market=general"/g,
  )?.length || 0,
  3,
  "All three inquiry buttons must route through the attributed contact page",
);

assert.equal(
  html.split("data-contact-link").length - 1,
  3,
  "All three inquiry buttons must preserve attribution parameters",
);

assert.ok(!html.includes("Pro（推奨）"), "Pro plan must not include the recommendation label");

assert.ok(
  !html.includes("詳細はご相談ください。"),
  "Pricing overages must be stated explicitly instead of requiring consultation",
);

assert.match(
  readme,
  /Standard\s*\|\s*¥498,000\s*\|\s*12TB／年\s*\|\s*1TB/,
  "README Standard pricing must match the approved homepage plan",
);

assert.match(
  readme,
  /Pro\s*\|\s*¥980,000\s*\|\s*50TB／年\s*\|\s*5TB/,
  "README Pro pricing must match the approved homepage plan",
);

const expectedReadmeOptions = [
  "| 転送量 ＋5TB／年 | ¥100,000 | ¥80,000 |",
  "| 転送量 ＋10TB／年 | ¥180,000 | ¥150,000 |",
  "| 保存容量 ＋500GB | ¥60,000／年 | ¥50,000／年 |",
  "| 保存容量 ＋1TB | ¥100,000／年 | ¥80,000／年 |",
];

const expectedHtmlOptionRows = [
  /<td>転送量 ＋5TB／年<\/td>\s*<td>¥100,000<\/td>\s*<td>¥80,000<\/td>/,
  /<td>転送量 ＋10TB／年<\/td>\s*<td>¥180,000<\/td>\s*<td>¥150,000<\/td>/,
  /<td>保存容量 ＋500GB<\/td>\s*<td>¥60,000／年<\/td>\s*<td>¥50,000／年<\/td>/,
  /<td>保存容量 ＋1TB<\/td>\s*<td>¥100,000／年<\/td>\s*<td>¥80,000／年<\/td>/,
];

for (const option of expectedReadmeOptions) {
  assert.ok(readme.includes(option), `README is missing approved option: ${option}`);
}

assert.ok(
  !readme.includes("ご詳細はご相談ください"),
  "README must state approved overage prices instead of requiring consultation",
);

const publishedHtml = html.replace(/<!--[\s\S]*?-->/g, "");
for (const path of ["/lp/elearning/", "/lp/ip/"]) {
  assert.ok(
    publishedHtml.includes(`href="${path}"`),
    `Homepage must publish the use-case route: ${path}`,
  );
}

for (const page of useCasePages) {
  const publishedPageHtml = page.html.replace(/<!--[\s\S]*?-->/g, "");
  assert.match(
    page.html,
    /Standard<\/strong><\/td>[\s\S]*?¥498,000[\s\S]*?12TB／年[\s\S]*?<td>1TB<\/td>/,
    `${page.name} Standard plan must match the approved homepage plan`,
  );
  assert.match(
    page.html,
    /Pro<\/strong><\/td>[\s\S]*?¥980,000[\s\S]*?50TB／年[\s\S]*?<td>5TB<\/td>/,
    `${page.name} Pro plan must match the approved homepage plan`,
  );
  for (const optionRow of expectedHtmlOptionRows) {
    assert.match(
      page.html,
      optionRow,
      `${page.name} must keep each approved option and its plan prices in the same row`,
    );
  }
  assert.ok(
    !page.html.includes("詳細はご相談ください"),
    `${page.name} must publish approved option prices`,
  );
  for (const technology of ["Widevine", "FairPlay", "PlayReady"]) {
    assert.ok(page.html.includes(technology), `${page.name} must name ${technology}`);
  }
  assert.ok(
    page.html.includes("ダウンロードにはDRMが適用されません"),
    `${page.name} must explain that DRM does not cover downloads`,
  );
  assert.ok(
    publishedPageHtml.includes('href="/"'),
    `${page.name} must publish a route back to the developer use case`,
  );
}

assert.ok(
  useCasePages[0].html.replace(/<!--[\s\S]*?-->/g, "").includes('href="/lp/ip/"'),
  "e-learning must publish the IP-content use-case route",
);
assert.ok(
  useCasePages[1].html.replace(/<!--[\s\S]*?-->/g, "").includes('href="/lp/elearning/"'),
  "IP content must publish the e-learning use-case route",
);

for (const prohibitedClaim of [
  "大手動画配信サービスと同水準",
  "会員・購入者以外は再生できません",
]) {
  assert.ok(
    !useCasePages.some((page) => page.html.includes(prohibitedClaim)),
    `Use-case pages must not contain the absolute claim: ${prohibitedClaim}`,
  );
}

console.log("Homepage pricing and DRM positioning are consistent.");
