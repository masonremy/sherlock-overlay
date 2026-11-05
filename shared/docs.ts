// The streamer's own PDFs (newspapers, directory, informants…) copied into
// artifacts/. The server reads each one's text layer once; clients render the
// pages with pdf.js and search the text. Nothing here is ever bundled or
// fetched: every file comes from the streamer.

export type DocKind = "newspaper" | "directory" | "informants" | "map" | "other";

/** A jump target inside a document: "B", "Auction Houses". */
export interface DocSection {
  label: string;
  page: number;
  kind: "letter" | "category";
  /** Top of the heading on its page (0–1). */
  y: number;
}

export interface DocInfo {
  /** "paper-03", "directory", "informants"… */
  id: string;
  kind: DocKind;
  title: string;
  /** Path under artifacts/, forward slashes. */
  file: string;
  pages: number;
  /** Newspapers: the masthead date, YYYY-MM-DD. */
  date: string | null;
  sections: DocSection[];
}

/** A run of text within a line: its characters and horizontal extent. */
export interface DocRun {
  start: number;
  end: number;
  x: number;
  w: number;
}

/** One line of text. Boxes are normalised to the page (0–1), y from the top. */
export interface DocLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  runs: DocRun[];
}

export interface DocPage {
  /** Page size in points (for its shape). */
  w: number;
  h: number;
  lines: DocLine[];
}

export interface DocText {
  id: string;
  pages: DocPage[];
}

/** Focus items backed by a document. */
export const DOC_FOCUS = ["newspaper", "directory", "informants"] as const;
