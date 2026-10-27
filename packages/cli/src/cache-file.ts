import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractionCacheStore } from "@pagepace/extractor";

/**
 * File-backed extraction cache (E8-T02, the CLI implementation of
 * `ExtractionCacheStore`): one `<key>.json` per entry inside a directory.
 *
 * The key is filename-safe by construction (`sha256` is hex, versions are
 * dotted numbers — `extractionCacheKey`). Reads treat a missing file as a
 * miss; writes go through a temp file plus a rename so a crash never leaves
 * a half-written entry that a later run would trust. A corrupt entry is
 * already a miss at the `readCachedBook` layer, which reprocesses and
 * overwrites it.
 */
export class FileExtractionCache implements ExtractionCacheStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await readFile(join(this.dir, `${key}.json`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = join(this.dir, `${key}.json.tmp`);
    await writeFile(tmp, value, "utf8");
    await rename(tmp, join(this.dir, `${key}.json`));
  }
}
