import { CallshiftWebCall, type TranscriptSegment } from "@callshift/web";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const firstName = element<HTMLInputElement>("first-name");
const start = element<HTMLButtonElement>("start");
const mute = element<HTMLButtonElement>("mute");
const end = element<HTMLButtonElement>("end");
const status = element("status");
const speaking = element("speaking");
const error = element("error");
const transcript = element("transcript");

const showSegment = ({ id, speaker, text, final }: TranscriptSegment) => {
  let line = document.getElementById(`segment-${id}`);
  if (!line) {
    line = document.createElement("p");
    line.id = `segment-${id}`;
    transcript.append(line);
  }
  line.className = `${speaker}${final ? "" : " interim"}`;
  line.textContent = `${speaker}: ${text}`;
};

start.addEventListener("click", async () => {
  start.disabled = true;
  error.textContent = "";
  transcript.replaceChildren();

  // Our server creates the call; the browser only gets its accessToken.
  const response = await fetch("/web-calls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstName: firstName.value }),
  });
  const created = await response.json();
  if (!response.ok) {
    error.textContent = `POST /v1/web-calls answered ${response.status}: ${created.error ?? ""}`;
    start.disabled = false;
    return;
  }

  const call = new CallshiftWebCall();
  let muted = false;
  call.on("status", (next) => {
    status.textContent = next;
    mute.disabled = next !== "live";
    end.disabled = next !== "live";
    if (next === "ended") start.disabled = false;
  });
  call.on("agentSpeaking", (isSpeaking) => {
    speaking.textContent = isSpeaking ? "(agent speaking)" : "";
  });
  call.on("transcript", showSegment);
  call.on("error", (callError) => {
    error.textContent = `${callError.code}: ${callError.message}`;
  });

  mute.onclick = async () => {
    muted = !muted;
    await (muted ? call.mute() : call.unmute());
    mute.textContent = muted ? "Unmute" : "Mute";
  };
  end.onclick = () => call.end();

  // Called from the click, so the browser lets the agent's audio play.
  await call.join({ accessToken: created.accessToken }).catch(() => {});
});
