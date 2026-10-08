// Phase 0 executable protocol experiment. Production transfer/cache belongs in Rust.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

export const protocol = Object.freeze(JSON.parse(
  readFileSync(new URL("../p2p/protocol-v1.json", import.meta.url), "utf8")
));

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSize(size, maximum) {
  if (!Number.isSafeInteger(size) || size < 1 || size > maximum) {
    throw new Error("Content size limit exceeded");
  }
}

export function packContent(rawBytes) {
  assertSize(rawBytes.length, protocol.maxUncompressedBytes);
  const compressed = gzipSync(rawBytes, { level: 6 });
  assertSize(compressed.length, protocol.maxCompressedBytes);
  return {
    compressed,
    manifest: {
      protocolVersion: protocol.protocolVersion,
      encoding: protocol.encoding,
      contentHash: sha256(rawBytes),
      compressedHash: sha256(compressed),
      compressedSize: compressed.length,
      uncompressedSize: rawBytes.length,
    },
  };
}

export function unpackContent(compressed, manifest) {
  if (manifest.protocolVersion !== protocol.protocolVersion || manifest.encoding !== protocol.encoding) {
    throw new Error("Unsupported content protocol");
  }
  assertSize(manifest.compressedSize, protocol.maxCompressedBytes);
  assertSize(manifest.uncompressedSize, protocol.maxUncompressedBytes);
  if (compressed.length !== manifest.compressedSize || sha256(compressed) !== manifest.compressedHash) {
    throw new Error("Compressed content integrity check failed");
  }
  // Bound inflation before allocating the declared JSON; never trust gzip ISIZE.
  const rawBytes = gunzipSync(compressed, { maxOutputLength: manifest.uncompressedSize });
  if (rawBytes.length !== manifest.uncompressedSize || sha256(rawBytes) !== manifest.contentHash) {
    throw new Error("Content integrity check failed");
  }
  const rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  const document = JSON.parse(rawText);
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Battle JSON must be an object");
  }
  return { rawBytes, document };
}
