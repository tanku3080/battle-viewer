import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { loadTs } from "./helpers/load-ts.mjs";
import { packContent, unpackContent, protocol, sha256 } from "../scripts/p2p-content-spike.mjs";

const { validateP2pManifest, P2P_PROTOCOL } = loadTs("utils/p2p/manifest.ts");
const { importCreatorBattleJson } = loadTs("utils/battleCreator/importBattle.ts");
const { loadBattleJson } = loadTs("utils/battle/loadBattleJson.ts");

test("P2P protocol spike preserves every sample byte and Viewer compatibility", () => {
  for (const name of fs.readdirSync("public").filter((name) => /^sample.*\.json$/.test(name))) {
    const raw = fs.readFileSync(`public/${name}`);
    const { compressed, manifest } = packContent(raw);
    const decoded = unpackContent(compressed, validateP2pManifest(manifest));
    assert.deepEqual(decoded.rawBytes, raw);
    assert.deepEqual(decoded.document, JSON.parse(raw.toString("utf8")));
    assert.deepEqual(loadBattleJson(decoded.document), loadBattleJson(JSON.parse(raw.toString("utf8"))));
  }
});

test("P2P round trip keeps Creator v2, hierarchy, group toggles and interpolation", () => {
  const item = {
    key: "unit-key", type: "unit", id: "u1", name: "ユニット", parentId: "r1",
    x: 0, y: 0, appearAt: 0, force: "Blue", groupMove: false,
    groupMoveTimeline: [{ t: 0, enabled: true }, { t: 6, enabled: false }],
    timeline: [{ t: 0, x: 0, y: 0, explicit: false, interpolate: false },
      { t: 3, x: 30, y: 20, explicit: true, interpolate: true }],
  };
  const raw = {
    title: "編集情報", map: { width: 1200, height: 700, coordinateOrigin: "center" },
    units: [{ id: "u1", force: "Blue" }], forces: [{ name: "Blue", color: "#112233" }],
    hierarchy: { roots: ["r1"], nodes: { r1: { id: "r1", level: "regiment", unitIds: ["u1"], childrenIds: [] } } },
    timeline: { units: { u1: [{ t: 0, x: 0, y: 0 }] }, camera: [{ t: 0, x: 0, y: 0, zoom: 1, interpolate: false }] },
    creatorState: { version: 2, coordinateOrigin: "center", duration: 20, items: [item] },
  };
  const bytes = Buffer.from(JSON.stringify(raw));
  const { compressed, manifest } = packContent(bytes);
  const decoded = unpackContent(compressed, manifest).document;
  assert.deepEqual(decoded.creatorState, raw.creatorState);
  assert.deepEqual(decoded.hierarchy, raw.hierarchy);
  assert.deepEqual(importCreatorBattleJson(decoded), importCreatorBattleJson(raw));
});

test("P2P manifest rejects unsupported protocols, malformed hashes and oversized claims", () => {
  assert.deepEqual(P2P_PROTOCOL, protocol);
  const valid = packContent(Buffer.from("{}")).manifest;
  for (const patch of [
    { protocolVersion: 2 }, { encoding: "zip" }, { contentHash: "../escape" },
    { compressedHash: "A".repeat(64) }, { compressedSize: 0 },
    { compressedSize: protocol.maxCompressedBytes + 1 }, { uncompressedSize: 1.5 },
    { uncompressedSize: protocol.maxUncompressedBytes + 1 },
  ]) assert.throws(() => validateP2pManifest({ ...valid, ...patch }));
});

test("P2P rejects corrupted compressed bytes, forged raw hash and incorrect sizes", () => {
  const { compressed, manifest } = packContent(Buffer.from('{"title":"テスト"}'));
  const corrupt = Buffer.from(compressed);
  corrupt[15] ^= 1;
  assert.throws(() => unpackContent(corrupt, manifest));
  assert.throws(() => unpackContent(compressed, { ...manifest, contentHash: "0".repeat(64) }));
  assert.throws(() => unpackContent(compressed, { ...manifest, compressedSize: compressed.length - 1 }));
  assert.throws(() => unpackContent(compressed, { ...manifest, uncompressedSize: 1 }));
});

test("P2P bounded inflation rejects a gzip bomb even with a valid compressed hash", () => {
  const compressed = gzipSync(Buffer.alloc(protocol.maxUncompressedBytes + 1));
  const manifest = { protocolVersion: 1, encoding: "gzip", compressedHash: sha256(compressed),
    contentHash: "0".repeat(64), compressedSize: compressed.length, uncompressedSize: 4096 };
  assert.throws(() => unpackContent(compressed, manifest));
});

test("P2P rejects non-JSON and invalid UTF-8 without normalizing original bytes", () => {
  for (const raw of [Buffer.from("[]"), Buffer.from("{broken}"), Buffer.from([0xff, 0xfe])]) {
    const { compressed, manifest } = packContent(raw);
    assert.throws(() => unpackContent(compressed, manifest));
  }
});
