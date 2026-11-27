// A tenant's site in miniature: the server holds the API key and creates the
// web call; the page only ever sees the accessToken.
//
//   CALLSHIFT_API_KEY=… CALLSHIFT_AGENT_ID=… pnpm example
//
// Then open http://localhost:4173 (a microphone needs https, or localhost).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const apiUrl = process.env.CALLSHIFT_API_URL ?? "https://api.callshift.ai";
const apiKey = process.env.CALLSHIFT_API_KEY;
const agentId = process.env.CALLSHIFT_AGENT_ID;
const port = Number(process.env.PORT ?? 4173);

if (!apiKey || !agentId) {
  console.error("Set CALLSHIFT_API_KEY and CALLSHIFT_AGENT_ID.");
  process.exit(1);
}

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// Bundled from the built package, as a tenant's bundler would.
const bundle = async () => {
  const { outputFiles } = await build({
    entryPoints: [here("./app.ts")],
    bundle: true,
    format: "esm",
    write: false,
    alias: { "@callshift/web": here("../dist/index.js") },
  });
  return outputFiles[0].text;
};

const readBody = async (request) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
};

const createWebCall = async (firstName) => {
  const response = await fetch(`${apiUrl}/v1/web-calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      contact: firstName ? { firstName } : undefined,
      metadata: { source: "@callshift/web example" },
    }),
  });
  return { status: response.status, body: await response.text() };
};

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/web-calls") {
      const { firstName } = await readBody(request);
      const { status, body } = await createWebCall(firstName);
      response.writeHead(status, { "Content-Type": "application/json" });
      return response.end(body);
    }
    if (request.url === "/app.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      return response.end(await bundle());
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(await readFile(here("./index.html")));
  } catch (error) {
    console.error(error);
    response.writeHead(500);
    response.end(String(error));
  }
}).listen(port, () => {
  console.log(
    `http://localhost:${port} (calls ${apiUrl} for agent ${agentId})`,
  );
});
