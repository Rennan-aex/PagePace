/**
 * English abbreviations (SEG-T02). Stored lowercase and without the trailing period;
 * matching is case-insensitive, so `Mr.`, `MR.` and `mr.` all hit. Multi-dot entries keep
 * their inner periods (`e.g`, `i.e`). Add new entries here: `sentences.test.ts` checks that
 * every entry is lowercase, free of a trailing period and non-empty.
 */
export const EN_ABBREVIATIONS: readonly string[] = [
  // Titles
  "mr",
  "mrs",
  "ms",
  "dr",
  "drs",
  "prof",
  "profs",
  "st",
  "jr",
  "sr",
  // Latin and comparison
  "e.g",
  "i.e",
  "vs",
  "cf",
  "etc",
  "al",
  // References and editorial marks
  "p",
  "pp",
  "ch",
  "chap",
  "sec",
  "vol",
  "vols",
  "fig",
  "figs",
  "ed",
  "eds",
  "dept",
  "inc",
  "ltd",
  "co",
];
