export type CryptoResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

export async function sha256(
  data: Uint8Array,
): Promise<CryptoResult<Uint8Array>> {
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return { success: true, data: new Uint8Array(hashBuffer) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function doubleSha256(
  data: Uint8Array,
): Promise<CryptoResult<Uint8Array>> {
  const firstHashResult = await sha256(data);
  if (!firstHashResult.success) {
    return firstHashResult;
  }

  return await sha256(firstHashResult.data);
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): CryptoResult<Uint8Array> {
  if (hex.length % 2 !== 0) {
    return { success: false, error: "Hex string must have even length" };
  }

  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return { success: true, data: bytes };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sha256Hex(input: string): Promise<CryptoResult<string>> {
  const bytes = stringToBytes(input);
  const hashResult = await sha256(bytes);

  if (!hashResult.success) {
    return hashResult;
  }

  return { success: true, data: bytesToHex(hashResult.data) };
}

export async function doubleSha256Hex(
  input: string,
): Promise<CryptoResult<string>> {
  const bytes = stringToBytes(input);
  const hashResult = await doubleSha256(bytes);

  if (!hashResult.success) {
    return hashResult;
  }

  return { success: true, data: bytesToHex(hashResult.data) };
}

export async function doubleSha256FromHex(
  hexInput: string,
): Promise<CryptoResult<string>> {
  const bytesResult = hexToBytes(hexInput);
  if (!bytesResult.success) {
    return bytesResult;
  }

  const hashResult = await doubleSha256(bytesResult.data);
  if (!hashResult.success) {
    return hashResult;
  }

  return { success: true, data: bytesToHex(hashResult.data) };
}
