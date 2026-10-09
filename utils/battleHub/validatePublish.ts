/**
 * User-facing admission preflight. Native P2P validates the full strict
 * document, embedded images, size bounds and hash before publication.
 * Never reserialize the original file as part of this check.
 */
type JsonObject = Record<string, unknown>;

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(name + " must be an object");
  }
  return value as JsonObject;
}
function positive(value: unknown, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(name + " must be a positive number");
  }
}
function validId(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024 ||
      /[\u0000-\u001f\u007f]/.test(value) ||
      ["__proto__", "prototype", "constructor"].includes(value)) {
    throw new Error(name + " has an invalid ID");
  }
  return value;
}
function points(value: unknown, name: string, camera = false): void {
  if (!Array.isArray(value)) throw new Error(name + " must be an array");
  for (const [index, entry] of value.entries()) {
    const point = object(entry, name + "[" + index + "]");
    if (typeof point.t !== "number" || !Number.isFinite(point.t) || point.t < 0 ||
        typeof point.x !== "number" || !Number.isFinite(point.x) ||
        typeof point.y !== "number" || !Number.isFinite(point.y)) {
      throw new Error(name + " contains invalid timeline coordinates");
    }
    if (camera) positive(point.zoom, name + ".zoom");
  }
}
function definitions(value: unknown, name: string): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > 10000) {
    throw new Error(name + " must be an array of at most 10000 items");
  }
  const seen = new Set<string>();
  for (const entry of value) {
    const item = object(entry, name + " item");
    const id = validId(item.id, name);
    if (seen.has(id)) throw new Error(name + " contains duplicate id: " + id);
    seen.add(id);
    if (item.timeline !== undefined) points(item.timeline, name + ".timeline");
  }
  return seen;
}

/** Preview check only; native Rust admission is authoritative. */
export function validatePublishBattle(document: unknown): { title: string } {
  const root = object(document, "Battle JSON");
  if (typeof root.title !== "string" || !root.title.trim() || root.title.length > 200) {
    throw new Error("Battle title must contain 1–200 characters");
  }
  const map = object(root.map, "map");
  positive(map.width, "map.width");
  positive(map.height, "map.height");
  if (map.coordinateOrigin !== undefined &&
      map.coordinateOrigin !== "center" && map.coordinateOrigin !== "top-left") {
    throw new Error("Invalid map.coordinateOrigin");
  }
  const units = definitions(root.units, "units");
  definitions(root.characters, "characters");
  const timeline = object(root.timeline, "timeline");
  for (const name of ["units", "characters", "hierarchy"]) {
    if (name === "units" || timeline[name] !== undefined) {
      const group = object(timeline[name], "timeline." + name);
      for (const [id, list] of Object.entries(group)) {
        validId(id, "timeline." + name);
        if (name === "units" && !units.has(id)) throw new Error("Unknown unit timeline: " + id);
        points(list, "timeline." + name + "." + id);
      }
    }
  }
  if (timeline.camera !== undefined) points(timeline.camera, "timeline.camera", true);
  if (root.camera !== undefined) points(root.camera, "camera", true);
  if (root.forces !== undefined) {
    if (!Array.isArray(root.forces)) throw new Error("forces must be an array");
    const names = new Set<string>();
    for (const force of root.forces) {
      const entry = object(force, "force");
      if (typeof entry.name !== "string" || !entry.name.trim() ||
          entry.name.length > 64 || typeof entry.color !== "string" ||
          !/^#[a-fA-F0-9]{6}$/.test(entry.color)) {
        throw new Error("Invalid force name or color");
      }
      const name = entry.name.trim().toLowerCase();
      if (names.has(name)) throw new Error("Duplicate force: " + name);
      names.add(name);
    }
  }
  return { title: root.title.trim() };
}
