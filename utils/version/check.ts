export type ClientVersion = {
  latestVersion: string;
  minimumVersion: string;
  releaseNotes: string;
  downloads: Record<string, string>;
  updaterManifestUrl: string | null;
};
export type UpdateStatus = "current" | "recommended" | "required";

export function compareSemver(a: string, b: string): number {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
  const left = pattern.exec(a);
  const right = pattern.exec(b);
  if (!left || !right) throw new Error("Invalid update version");
  for (let index = 1; index <= 3; index++) {
    const x = BigInt(left[index]), y = BigInt(right[index]);
    if (x !== y) return x < y ? -1 : 1;
  }
  const x = left[4], y = right[4];
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  // prerelease semver identifiers: numeric identifiers sort before strings.
  const xs = x.split("."), ys = y.split(".");
  for (let index = 0; index < Math.max(xs.length, ys.length); index++) {
    if (xs[index] === undefined) return -1;
    if (ys[index] === undefined) return 1;
    const lx = xs[index], ly = ys[index];
    const xn = /^\d+$/.test(lx), yn = /^\d+$/.test(ly);
    if (xn && yn) {
      const ax = BigInt(lx), by = BigInt(ly);
      if (ax !== by) return ax < by ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (lx !== ly) {
      return lx < ly ? -1 : 1;
    }
  }
  return 0;
}
export function determineUpdate(current: string, info: ClientVersion): UpdateStatus {
  if (compareSemver(info.minimumVersion, info.latestVersion) > 0)
    throw new Error("Invalid server version range");
  if (compareSemver(current, info.minimumVersion) < 0) return "required";
  if (compareSemver(current, info.latestVersion) < 0) return "recommended";
  return "current";
}
export function safeDownloadUrl(info: ClientVersion, platform: string): string | null {
  const target = info.downloads[platform];
  if (!target) return null;
  try {
    const url = new URL(target);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
