// @pagepace/eval - evaluation runner: corpus manifests (E1-T05, ADR-031),
// `text_cer` metric and the `pnpm eval` runner (E1-T06, ADR-035), plus the
// baseline and the CI regression gate (E1-T08, ADR-008).
export const PACKAGE_NAME = "@pagepace/eval";

export {
  BASELINE_FORMAT_VERSION,
  BASELINE_RELATIVE_PATH,
  BASELINE_TOLERANCE,
  type Baseline,
  type BaselineChange,
  type BaselineComparison,
  type BaselineDocuments,
  BaselineError,
  type BaselineGap,
  baselinePath,
  compareBaseline,
  METRIC_DIRECTIONS,
  type MetricDirection,
  parseBaseline,
  readBaseline,
  serializeBaseline,
  writeBaseline,
} from "./baseline";

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
  SYNTHETIC_DIR,
} from "./corpus";

export {
  type DocumentResult,
  type DocumentStatus,
  type EvalIo,
  type EvalOptions,
  type EvalResult,
  EXIT_ERROR as EVAL_EXIT_ERROR,
  EXIT_OK as EVAL_EXIT_OK,
  EXIT_USAGE as EVAL_EXIT_USAGE,
  HELP as EVAL_HELP,
  type IngestFn,
  type LevelSummary,
  runEval,
  runEvalCli,
} from "./eval";

export {
  GOLDEN_FORMAT_VERSION,
  GOLDEN_KINDS,
  GOLDEN_SOURCES,
  type Golden,
  type GoldenBlock,
  GoldenError,
  type GoldenOrigin,
  type GoldenRun,
  goldenText,
  hasGolden,
  parseGolden,
  resolveGoldenPath,
  serializeGolden,
} from "./golden";

export { type CerOptions, type CerResult, MAX_CER_CELLS, normalizeText, textCer } from "./metrics";
export { SYNTHETIC_SPECS, syntheticSpecOf } from "./specs";
export {
  buildSynthetic,
  type SyntheticArtifact,
  type SyntheticBlockSpec,
  type SyntheticRunSpec,
  type SyntheticSpec,
  SyntheticSpecError,
} from "./synthetic";

export { documentText, pageText, SPACE_GAP_EM } from "./text";
