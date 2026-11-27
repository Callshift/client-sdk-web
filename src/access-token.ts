import { CallshiftWebCallError } from "./callshift-web-call-error.js";

export type RoomConnection = { serverUrl: string; participantToken: string };

const isRoomConnection = (value: unknown): value is RoomConnection =>
  typeof value === "object" &&
  value !== null &&
  "serverUrl" in value &&
  typeof value.serverUrl === "string" &&
  "participantToken" in value &&
  typeof value.participantToken === "string";

// The accessToken POST /v1/web-calls returns: base64url JSON, read only here.
export const readAccessToken = (accessToken: string): RoomConnection => {
  const invalid = (cause?: unknown) =>
    new CallshiftWebCallError(
      "invalid_access_token",
      "This is not an access token from POST /v1/web-calls.",
      { cause },
    );
  let decoded: unknown;
  try {
    const base64 = accessToken.replaceAll("-", "+").replaceAll("_", "/");
    decoded = JSON.parse(atob(base64));
  } catch (cause) {
    throw invalid(cause);
  }
  if (!isRoomConnection(decoded)) throw invalid();
  return decoded;
};
