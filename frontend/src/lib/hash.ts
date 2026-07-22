/** Dosyanın SHA-256 hash'ini tarayıcıda hesaplar (hex, 0x'siz) */
export async function sha256HexFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Kontrat bytes32 için 0x + 64 hex */
export function toBytes32Hex(hexHash: string): `0x${string}` {
  const clean = hexHash.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error("Geçersiz hash: 64 hex karakter olmalı.");
  }
  return `0x${clean}` as `0x${string}`;
}

export function isTxHashLike(value: string): boolean {
  const v = value.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(v) && v.length === 66;
}

export function isFileHashLike(value: string): boolean {
  const clean = value.replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(clean) && clean.length === 64;
}

export function shortenAddress(addr: string, chars = 4): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 2 + chars)}...${addr.slice(-chars)}`;
}
