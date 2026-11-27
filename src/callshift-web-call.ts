import { ICallRoom, CallRoomError, TranscriptStream } from "./call-room.js";
import { LivekitCallRoom } from "./livekit-call-room.js";
import { readAccessToken } from "./access-token.js";
import { CallshiftWebCallError } from "./callshift-web-call-error.js";

const toCallError = (cause: unknown): CallshiftWebCallError => {
  if (cause instanceof CallshiftWebCallError) return cause;
  if (cause instanceof CallRoomError && cause.reason === "microphone") {
    return new CallshiftWebCallError(
      "microphone_unavailable",
      "The browser gave no microphone: the visitor refused it, or has none.",
      { cause },
    );
  }
  return new CallshiftWebCallError(
    "connection_failed",
    "The call could not be joined: its access token may have expired.",
    { cause },
  );
};

export type TranscriptSegment = {
  id: string;
  speaker: "agent" | "caller";
  text: string;
  final: boolean;
};

export type CallStatus = "connecting" | "live" | "ended";

type CallEvents = {
  status: (status: CallStatus) => void;
  error: (error: CallshiftWebCallError) => void;
  agentSpeaking: (isSpeaking: boolean) => void;
  transcript: (segment: TranscriptSegment) => void;
};

export class CallshiftWebCall {
  private readonly listeners: {
    [E in keyof CallEvents]: Set<CallEvents[E]>;
  } = {
    status: new Set(),
    error: new Set(),
    agentSpeaking: new Set(),
    transcript: new Set(),
  };

  private status: CallStatus | null = null;
  private agentIsSpeaking = false;

  constructor();
  /** @internal The tests pass a simulated room. */
  constructor(room: ICallRoom);
  constructor(private readonly room: ICallRoom = new LivekitCallRoom()) {}

  /** Returns the function that unsubscribes the listener. */
  on<E extends keyof CallEvents>(event: E, listener: CallEvents[E]) {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  async join({ accessToken }: { accessToken: string }): Promise<void> {
    if (this.status !== null) {
      throw new Error(
        "This call has already been joined: create a new CallshiftWebCall for the next one.",
      );
    }
    this.setStatus("connecting");
    try {
      await this.room.connect(readAccessToken(accessToken), {
        disconnected: () => {
          this.setAgentSpeaking(false);
          this.setStatus("ended");
        },
        agentSpeaking: (isSpeaking) => this.setAgentSpeaking(isSpeaking),
        transcriptStream: (stream) => this.relayTranscript(stream),
      });
    } catch (cause) {
      const error = toCallError(cause);
      this.fail(error);
      throw error;
    }
    this.setStatus("live");
  }

  mute(): Promise<void> {
    return this.room.setMicrophoneEnabled(false);
  }

  unmute(): Promise<void> {
    return this.room.setMicrophoneEnabled(true);
  }

  end(): Promise<void> {
    return this.room.disconnect();
  }

  private async relayTranscript({
    id,
    speaker,
    text,
    isFinal,
  }: TranscriptStream) {
    let said = "";
    try {
      for await (const chunk of text) {
        said += chunk;
        this.emit("transcript", { id, speaker, text: said, final: false });
      }
    } catch {
      // A stream closed abnormally has no final line to give.
      return;
    }
    if (isFinal())
      this.emit("transcript", { id, speaker, text: said, final: true });
  }

  private setAgentSpeaking(isSpeaking: boolean) {
    if (isSpeaking === this.agentIsSpeaking) return;
    this.agentIsSpeaking = isSpeaking;
    this.emit("agentSpeaking", isSpeaking);
  }

  private fail(error: CallshiftWebCallError) {
    this.emit("error", error);
    this.setStatus("ended");
  }

  private setStatus(status: CallStatus) {
    if (this.status === "ended" || this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private emit<E extends keyof CallEvents>(
    event: E,
    ...args: Parameters<CallEvents[E]>
  ) {
    for (const listener of this.listeners[event]) {
      (listener as (...a: Parameters<CallEvents[E]>) => void)(...args);
    }
  }
}
