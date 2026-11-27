# @callshift/web

Talk to a Callshift agent from your website, in the visitor's browser.

```sh
npm install @callshift/web
```

## How a web call works

1. **Your server** creates the web call with your API key:
   [`POST /v1/web-calls`](https://api.callshift.ai/swagger). It answers
   `{ callId, accessToken, expiresAt }`. Never call it from the browser: the
   page would expose your API key.
2. **Your server** hands `accessToken` to the browser.
3. **The browser** joins the call with this package before `expiresAt`, two
   minutes after the call was created.

```ts
// On your server, e.g. behind POST /api/web-call
const response = await fetch("https://api.callshift.ai/v1/web-calls", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CALLSHIFT_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "…",
    contact: { firstName: "Ada" }, // fills the agent's contact.* variables
    metadata: { orderId: "A-42" }, // yours, returned on the call and its webhook
  }),
});
const { accessToken } = await response.json();
```

## Joining from the browser

```ts
import { CallshiftWebCall } from "@callshift/web";

const call = new CallshiftWebCall();

call.on("status", (status) => {}); // "connecting", then "live", then "ended"
call.on("agentSpeaking", (isSpeaking) => {});
call.on("transcript", ({ id, speaker, text, final }) => {});
call.on("error", (error) => {}); // a CallshiftWebCallError, see below

startButton.addEventListener("click", async () => {
  const { accessToken } = await (
    await fetch("/api/web-call", { method: "POST" })
  ).json();
  await call.join({ accessToken });
});

call.mute();
call.unmute();
await call.end();
```

- **`join({ accessToken })`** asks for the microphone, joins the call and
  resolves once it is `live`. If it fails, it emits `error`, then `ended`, and
  rejects with the same error.
- **`transcript`** carries what the agent (`speaker: "agent"`) and the visitor
  (`speaker: "caller"`) say. A segment arrives several times as its text
  grows, with the same `id`, the last time with `final: true`: replace a line
  by its `id` rather than appending each event.
- **`status: "ended"`** comes once, whoever ends the call: the visitor with
  `end()`, or the agent hanging up.
- **One `CallshiftWebCall` per call.** Once it has been joined, create a new
  one for the next call: `join()` refuses to run twice.
- **`on()` returns a function** that removes the listener.

### Errors

| `error.code`             | What happened                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `invalid_access_token`   | The token is not one `POST /v1/web-calls` returned.                                   |
| `microphone_unavailable` | The visitor refused the microphone, or has none.                                      |
| `connection_failed`      | The call could not be joined; its access token may have expired. Create another call. |

## In the browser

- **Microphone and HTTPS.** Browsers only grant the microphone to a secure
  page: `https://`, or `http://localhost` while you develop.
- **Autoplay.** Call `join()` from a click (or another user gesture), so the
  browser lets the agent's voice play.
- **Content-Security-Policy.** If your site sets one, allow the media servers
  in `connect-src`:

  ```
  connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud
  ```

## Example

[`example/`](./example) is a page and a small Node server that create a web
call through the API and join it:

```sh
pnpm install
CALLSHIFT_API_KEY=… CALLSHIFT_AGENT_ID=… pnpm example
```

Then open http://localhost:4173.

## Developing

```sh
pnpm install
pnpm test          # the call, against a simulated room
pnpm typecheck && pnpm lint && pnpm format:check
pnpm pack:checked  # packs the package and checks what would be published
```

A release is a version bump in `package.json`, merged, then a `v<version>` tag:
the release workflow publishes it to npm.
