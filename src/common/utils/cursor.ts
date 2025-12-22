export function encodeCursor(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString('base64url');
}

export function decodeCursor<T>(cursor: string): T {
  const json = Buffer.from(cursor, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}
