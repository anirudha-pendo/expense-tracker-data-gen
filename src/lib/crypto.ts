function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufferToHex(saltBytes.buffer as ArrayBuffer);

  const key = await importKey(password);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );

  return { hash: bufferToHex(derivedBits), salt };
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const saltBuffer = hexToBuffer(salt);
  const key = await importKey(password);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer.buffer as ArrayBuffer, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );

  return bufferToHex(derivedBits) === storedHash;
}
