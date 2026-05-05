export type CursorPayload = {
  field: string;
  id: string;
};

export const encodeCursor = (payload: CursorPayload): string => Buffer.from(JSON.stringify(payload)).toString("base64url")

export const decodeCursor = (cursor: string) => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))