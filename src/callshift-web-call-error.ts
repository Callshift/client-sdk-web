export type CallshiftWebCallErrorCode =
  "invalid_access_token" | "microphone_unavailable" | "connection_failed";

export class CallshiftWebCallError extends Error {
  constructor(
    readonly code: CallshiftWebCallErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CallshiftWebCallError";
  }
}
