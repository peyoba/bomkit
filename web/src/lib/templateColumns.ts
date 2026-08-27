import { colLetterToIndex, indexToColLetter } from "./colLetters";

export function maxColumnCount(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

export function padRow(row: string[], cols: number): string[] {
  if (row.length >= cols) return row.slice(0, cols);
  return [...row, ...Array(cols - row.length).fill("")];
}

export function normalizeColumns(
  columns: Record<string, string | null>,
  columnCount: number
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (let i = 0; i < columnCount; i++) {
    const letter = indexToColLetter(i);
    result[letter] = Object.prototype.hasOwnProperty.call(columns, letter)
      ? columns[letter]
      : null;
  }
  return result;
}

export function inferredColumnCount(columns: Record<string, string | null>): number {
  const keys = Object.keys(columns);
  if (keys.length === 0) return 0;
  return Math.max(...keys.map((letter) => colLetterToIndex(letter) + 1));
}
