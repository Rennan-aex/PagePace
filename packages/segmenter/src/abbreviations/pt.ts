/**
 * Portuguese abbreviations (SEG-T02). Stored lowercase and without the trailing period;
 * matching is case-insensitive, so `Sr.`, `SRA.` and `sr.` all hit. Add new entries here:
 * `sentences.test.ts` checks that every entry is lowercase, period-free and non-empty.
 */
export const PT_ABBREVIATIONS: readonly string[] = [
  // Titles
  "sr",
  "sra",
  "srs",
  "sras",
  "snr",
  "snra",
  "snrs",
  "snras",
  "dr",
  "dra",
  "drs",
  "dras",
  "prof",
  "profa",
  "profs",
  "profas",
  "eng",
  "enga",
  // References and editorial marks
  "ex",
  "etc",
  "p",
  "pp",
  "pág",
  "págs",
  "cap",
  "caps",
  "v",
  "vol",
  "vols",
  "fig",
  "figs",
  "ed",
  "eds",
];
