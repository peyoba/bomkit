export function indexToColLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`bad col ${index}`);
  }
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function colLetterToIndex(letter: string): number {
  let idx = 0;
  for (const ch of letter) {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code < 65 || code > 90) throw new Error(`bad letter ${letter}`);
    idx = idx * 26 + (code - 64);
  }
  return idx - 1;
}

export function cellRef(colIndex: number, excelRow: number): string {
  return `${indexToColLetter(colIndex)}${excelRow}`;
}
