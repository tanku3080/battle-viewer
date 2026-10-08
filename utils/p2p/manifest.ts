import protocol from "@/p2p/protocol-v1.json";

export const P2P_PROTOCOL = Object.freeze(protocol);

/** Hash the original UTF-8 bytes, including creatorState. Never hash a Viewer projection. */
export type P2pManifest = {
  protocolVersion: 1;
  encoding: "gzip";
  contentHash: string;
  compressedHash: string;
  compressedSize: number;
  uncompressedSize: number;
};

export function validateP2pManifest(value: unknown): P2pManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid P2P manifest");
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.protocolVersion !== P2P_PROTOCOL.protocolVersion ||
      manifest.encoding !== P2P_PROTOCOL.encoding) {
    throw new Error("Unsupported P2P protocol or encoding");
  }
  for (const field of ["contentHash", "compressedHash"] as const) {
    if (typeof manifest[field] !== "string" || !/^[a-f0-9]{64}$/.test(manifest[field])) {
      throw new Error(`Invalid ${field}`);
    }
  }
  for (const [field, maximum] of [
    ["compressedSize", P2P_PROTOCOL.maxCompressedBytes],
    ["uncompressedSize", P2P_PROTOCOL.maxUncompressedBytes],
  ] as const) {
    const size = manifest[field];
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > maximum) {
      throw new Error(`Invalid ${field}`);
    }
  }
  return {
    protocolVersion: 1,
    encoding: "gzip",
    contentHash: manifest.contentHash as string,
    compressedHash: manifest.compressedHash as string,
    compressedSize: manifest.compressedSize as number,
    uncompressedSize: manifest.uncompressedSize as number,
  };
}
