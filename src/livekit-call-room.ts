import type { RoomConnection } from "./access-token.js";
import {
  createLocalAudioTrack,
  Participant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type TextStreamHandler,
} from "livekit-client";
import { ICallRoom, CallRoomError, CallRoomEvents } from "./call-room.js";

// LiveKit Agents publishes what each side says on this topic.
const TRANSCRIPTION_TOPIC = "lk.transcription";

const playAudio = (track: RemoteTrack) => {
  if (track.kind !== Track.Kind.Audio) return;
  const element = track.attach();
  element.hidden = true;
  document.body.appendChild(element);
};

const stopAudio = (track: RemoteTrack) => {
  for (const element of track.detach()) element.remove();
};

export class LivekitCallRoom implements ICallRoom {
  private room: Room | null = null;

  async connect(
    { serverUrl, participantToken }: RoomConnection,
    events: CallRoomEvents,
  ): Promise<void> {
    // Asked before joining, so a visitor without a microphone starts nothing.
    const microphone = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }).catch((cause: unknown) => {
      throw new CallRoomError("microphone", { cause });
    });

    const room = new Room();
    room.on(RoomEvent.TrackSubscribed, playAudio);
    room.on(RoomEvent.TrackUnsubscribed, stopAudio);
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) =>
      events.agentSpeaking(speakers.some((speaker) => speaker.isAgent)),
    );
    room.registerTextStreamHandler(
      TRANSCRIPTION_TOPIC,
      this.transcriptHandler(room, events),
    );

    try {
      await room.connect(serverUrl, participantToken);
      await room.localParticipant.publishTrack(microphone);
      await room.startAudio();
    } catch (cause) {
      microphone.stop();
      await room.disconnect();
      throw new CallRoomError("connection", { cause });
    }

    // Registered once joined, so a failed join reports its error, not an end.
    room.on(RoomEvent.Disconnected, () => {
      microphone.stop();
      this.room = null;
      events.disconnected();
    });
    this.room = room;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.room?.localParticipant.setMicrophoneEnabled(enabled);
  }

  async disconnect(): Promise<void> {
    await this.room?.disconnect();
  }

  private transcriptHandler(
    room: Room,
    events: CallRoomEvents,
  ): TextStreamHandler {
    return (reader, { identity }) => {
      void events.transcriptStream({
        id: reader.info.attributes?.["lk.segment_id"] ?? reader.info.id,
        speaker:
          identity === room.localParticipant.identity ? "caller" : "agent",
        text: reader,
        // The stream's closing attributes are merged into its info.
        isFinal: () =>
          reader.info.attributes?.["lk.transcription_final"] === "true",
      });
    };
  }
}
