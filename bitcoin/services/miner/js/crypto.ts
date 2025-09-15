export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

export async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const firstHash = await sha256(data);
  return await sha256(firstHash);
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = stringToBytes(input);
  const hash = await sha256(bytes);
  return bytesToHex(hash);
}

export async function doubleSha256Hex(input: string): Promise<string> {
  const bytes = stringToBytes(input);
  const hash = await doubleSha256(bytes);
  return bytesToHex(hash);
}
