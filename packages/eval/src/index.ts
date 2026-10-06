// @pagepace/eval - evaluation runner. `corpus.ts` ships now (E1-T05, ADR-031);
// the metrics themselves arrive with the roadmap phases (docs/extractor/ROADMAP.md).
export const PACKAGE_NAME = "@pagepace/eval";

export {
  type CorpusEntry,
  CorpusError,
  type LoadedCorpus,
  loadCorpus,
  type ManifestEntry,
  type PrivateDirSource,
  parseDotEnv,
  parseManifest,
  REPO_ROOT,
  resolveCorpusPrivateDir,
  resolveCorpusPrivateDirDetailed,
} from "./corpus";
