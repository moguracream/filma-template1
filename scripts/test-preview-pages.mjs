import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForPreview(url, process) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`Preview process exited with ${process.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Preview server did not start");
}

const port = await reservePort();
const preview = spawn("scripts/preview-pages", [String(port)], {
  cwd: root,
  stdio: "ignore",
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForPreview(`${baseUrl}/`, preview);

  const contactResponse = await fetch(`${baseUrl}/contact/`);
  assert.equal(contactResponse.status, 200, "Preview must include /contact/");
  assert.match(
    await contactResponse.text(),
    /\/assets\/js\/contact-redirect\.mjs/,
  );

  const moduleResponse = await fetch(
    `${baseUrl}/assets/js/contact-redirect.mjs`,
  );
  assert.equal(
    moduleResponse.status,
    200,
    "Preview must include the contact JavaScript module",
  );
} finally {
  preview.kill("SIGTERM");
  if (preview.exitCode === null) await once(preview, "exit");
}

console.log("Local Pages preview includes the contact flow.");
