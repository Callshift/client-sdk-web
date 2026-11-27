import {
  CallshiftWebCall,
  CallshiftWebCallError,
  CallStatus,
  TranscriptSegment,
} from "./index.js";
import { CallRoomSimulator } from "./__simulators__/call-room.simulator.js";

const SERVER_URL = "wss://us.livekit.test";
const PARTICIPANT_TOKEN = "participant-token"; // gitleaks:allow

// What POST /v1/web-calls returns; tenants pass it on unread.
const accessTokenFor = (serverUrl: string, participantToken: string) =>
  Buffer.from(JSON.stringify({ serverUrl, participantToken })).toString(
    "base64url",
  );

const ACCESS_TOKEN = accessTokenFor(SERVER_URL, PARTICIPANT_TOKEN); // gitleaks:allow

describe("CallshiftWebCall", () => {
  let room: CallRoomSimulator;
  let call: CallshiftWebCall;
  let statuses: CallStatus[];
  let errors: CallshiftWebCallError[];

  beforeEach(() => {
    room = new CallRoomSimulator();
    call = new CallshiftWebCall(room);
    statuses = [];
    call.on("status", (status) => statuses.push(status));
    errors = [];
    call.on("error", (error) => errors.push(error));
  });

  it("joins the call's room and goes live", async () => {
    await call.join({ accessToken: ACCESS_TOKEN });

    expect(room.connections).toEqual([
      { serverUrl: SERVER_URL, participantToken: PARTICIPANT_TOKEN },
    ]);
    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("ends when the agent hangs up", async () => {
    await call.join({ accessToken: ACCESS_TOKEN });

    room.hangUp();

    expect(statuses).toEqual(["connecting", "live", "ended"]);
  });

  it("leaves the room when the caller ends the call, and ends once", async () => {
    await call.join({ accessToken: ACCESS_TOKEN });

    await call.end();

    expect(room.isConnected).toBe(false);
    expect(statuses).toEqual(["connecting", "live", "ended"]);
  });

  it("refuses an access token that POST /v1/web-calls did not return", async () => {
    const joining = call.join({ accessToken: "not-an-access-token" });

    await expect(joining).rejects.toMatchObject({
      code: "invalid_access_token",
    });
    expect(errors).toEqual([await joining.catch((error: unknown) => error)]);
    expect(room.connections).toEqual([]);
    expect(statuses).toEqual(["connecting", "ended"]);
  });

  it.each([
    [
      "the browser has no microphone it may use",
      "microphone",
      "microphone_unavailable",
    ],
    ["the room cannot be joined", "connection", "connection_failed"],
  ] as const)("ends with an error when %s", async (_case, reason, code) => {
    room.failConnect(reason);

    await expect(
      call.join({ accessToken: ACCESS_TOKEN }),
    ).rejects.toMatchObject({ code });
    expect(errors.map((error) => error.code)).toEqual([code]);
    expect(statuses).toEqual(["connecting", "ended"]);
  });

  it("tells when the agent starts and stops speaking", async () => {
    const speaking: boolean[] = [];
    call.on("agentSpeaking", (isSpeaking) => speaking.push(isSpeaking));
    await call.join({ accessToken: ACCESS_TOKEN });

    room.agentSpeaks();
    room.agentFallsSilent();

    expect(speaking).toEqual([true, false]);
  });

  it("tells only when the agent's speaking changes, not each time the room repeats it", async () => {
    const speaking: boolean[] = [];
    call.on("agentSpeaking", (isSpeaking) => speaking.push(isSpeaking));
    await call.join({ accessToken: ACCESS_TOKEN });

    room.agentSpeaks();
    room.agentSpeaks();
    room.agentFallsSilent();
    room.agentFallsSilent();

    expect(speaking).toEqual([true, false]);
  });

  it("tells the agent fell silent when the call ends mid-sentence", async () => {
    const events: string[] = [];
    call.on("agentSpeaking", (isSpeaking) =>
      events.push(`agentSpeaking:${isSpeaking}`),
    );
    call.on("status", (status) => events.push(`status:${status}`));
    await call.join({ accessToken: ACCESS_TOKEN });

    room.agentSpeaks();
    room.hangUp();

    expect(events).toEqual([
      "status:connecting",
      "status:live",
      "agentSpeaking:true",
      "agentSpeaking:false",
      "status:ended",
    ]);
  });

  it("passes on what each side says as it grows, then its final line once the stream closes", async () => {
    const transcript: TranscriptSegment[] = [];
    call.on("transcript", (segment) => transcript.push(segment));
    await call.join({ accessToken: ACCESS_TOKEN });

    // LiveKit Agents marks an agent's segment final only when its stream closes.
    await room.streamsTranscript({
      id: "s1",
      speaker: "agent",
      chunks: ["Hello", " Ada!"],
      finalOnceClosed: true,
    });
    await room.streamsTranscript({
      id: "s2",
      speaker: "caller",
      chunks: ["Hi"],
      finalOnceClosed: true,
    });

    expect(transcript).toEqual([
      { id: "s1", speaker: "agent", text: "Hello", final: false },
      { id: "s1", speaker: "agent", text: "Hello Ada!", final: false },
      { id: "s1", speaker: "agent", text: "Hello Ada!", final: true },
      { id: "s2", speaker: "caller", text: "Hi", final: false },
      { id: "s2", speaker: "caller", text: "Hi", final: true },
    ]);
  });

  it("leaves an interim segment unfinished", async () => {
    const transcript: TranscriptSegment[] = [];
    call.on("transcript", (segment) => transcript.push(segment));
    await call.join({ accessToken: ACCESS_TOKEN });

    await room.streamsTranscript({
      id: "s1",
      speaker: "agent",
      chunks: ["Hel"],
      finalOnceClosed: false,
    });

    expect(transcript).toEqual([
      { id: "s1", speaker: "agent", text: "Hel", final: false },
    ]);
  });

  it("mutes and unmutes the caller's microphone", async () => {
    await call.join({ accessToken: ACCESS_TOKEN });

    await call.mute();
    const whileMuted = room.isMicrophoneOn;
    await call.unmute();

    expect(whileMuted).toBe(false);
    expect(room.isMicrophoneOn).toBe(true);
  });

  it("refuses to join a second time: each call gets its own CallshiftWebCall", async () => {
    await call.join({ accessToken: ACCESS_TOKEN });
    await call.end();

    await expect(call.join({ accessToken: ACCESS_TOKEN })).rejects.toThrow(
      "new CallshiftWebCall",
    );
    expect(room.connections).toHaveLength(1);
  });

  it("stops telling a listener once it unsubscribes", async () => {
    const seen: CallStatus[] = [];
    const unsubscribe = call.on("status", (status) => seen.push(status));
    await call.join({ accessToken: ACCESS_TOKEN });

    unsubscribe();
    await call.end();

    expect(seen).toEqual(["connecting", "live"]);
  });
});
