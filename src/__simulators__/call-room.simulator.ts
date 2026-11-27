import type { RoomConnection } from "../access-token.js";
import { ICallRoom, CallRoomError, CallRoomEvents } from "../call-room.js";

export class CallRoomSimulator implements ICallRoom {
  readonly connections: RoomConnection[] = [];
  private events: CallRoomEvents | null = null;
  private connectFailure: CallRoomError["reason"] | null = null;

  failConnect(reason: CallRoomError["reason"]) {
    this.connectFailure = reason;
  }

  isMicrophoneOn = false;

  get isConnected() {
    return this.events !== null;
  }

  connect(connection: RoomConnection, events: CallRoomEvents): Promise<void> {
    if (this.connectFailure) {
      return Promise.reject(new CallRoomError(this.connectFailure));
    }
    this.connections.push(connection);
    this.events = events;
    this.isMicrophoneOn = true;
    return Promise.resolve();
  }

  setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.isMicrophoneOn = enabled;
    return Promise.resolve();
  }

  // Leaving the room fires `disconnected`, as LiveKit's room does.
  disconnect(): Promise<void> {
    this.hangUp();
    return Promise.resolve();
  }

  agentSpeaks() {
    this.events?.agentSpeaking(true);
  }

  agentFallsSilent() {
    this.events?.agentSpeaking(false);
  }

  async streamsTranscript({
    id,
    speaker,
    chunks,
    finalOnceClosed,
  }: {
    id: string;
    speaker: "agent" | "caller";
    chunks: string[];
    finalOnceClosed: boolean;
  }) {
    let closed = false;
    let next = 0;
    const text: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<string>> => {
          if (next < chunks.length) {
            return Promise.resolve({ value: chunks[next++], done: false });
          }
          closed = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      }),
    };
    await this.events?.transcriptStream({
      id,
      speaker,
      text,
      isFinal: () => closed && finalOnceClosed,
    });
  }

  hangUp() {
    const events = this.events;
    this.events = null;
    events?.disconnected();
  }
}
