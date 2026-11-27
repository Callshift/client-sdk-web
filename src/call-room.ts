import type { RoomConnection } from "./access-token.js";

export class CallRoomError extends Error {
  constructor(
    readonly reason: "microphone" | "connection",
    options?: { cause?: unknown },
  ) {
    super(`The room could not be joined: ${reason}`, options);
    this.name = "CallRoomError";
  }
}

export type TranscriptStream = {
  id: string;
  speaker: "agent" | "caller";
  text: AsyncIterable<string>;
  // LiveKit Agents marks an agent's segment final only as its stream closes.
  isFinal: () => boolean;
};

export type CallRoomEvents = {
  disconnected: () => void;
  // Fired on each change of the room's speakers, so it can repeat itself.
  agentSpeaking: (isSpeaking: boolean) => void;
  transcriptStream: (stream: TranscriptStream) => Promise<void>;
};

// The media transport, which tenants never see.
export interface ICallRoom {
  connect(connection: RoomConnection, events: CallRoomEvents): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  disconnect(): Promise<void>;
}
