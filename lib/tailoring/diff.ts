export type DiffPart = { text: string; changed: boolean };

// Compare exact words and whitespace; the text itself always stays intact.
export function compareWords(
  before: string,
  after: string,
): { before: DiffPart[]; after: DiffPart[] } {
  const left = before.match(/\s+|\S+/g) ?? [];
  const right = after.match(/\s+|\S+/g) ?? [];
  const sameLeft = new Set<number>();
  const sameRight = new Set<number>();
  if (left.length * right.length <= 160000) {
    const width = right.length + 1;
    const lengths = new Uint16Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) {
      for (let j = right.length - 1; j >= 0; j--) {
        lengths[i * width + j] =
          left[i] === right[j]
            ? lengths[(i + 1) * width + j + 1] + 1
            : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        sameLeft.add(i++);
        sameRight.add(j++);
      } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    // Keep long sections responsive while still marking their changed middle.
    let start = 0;
    while (start < left.length && start < right.length && left[start] === right[start]) {
      sameLeft.add(start);
      sameRight.add(start++);
    }
    let i = left.length - 1;
    let j = right.length - 1;
    while (i >= start && j >= start && left[i] === right[j]) {
      sameLeft.add(i--);
      sameRight.add(j--);
    }
  }
  function compact(tokens: string[], same: Set<number>): DiffPart[] {
    const parts: DiffPart[] = [];
    tokens.forEach((text, index) => {
      const changed = !same.has(index);
      const last = parts[parts.length - 1];
      if (last && last.changed === changed) last.text += text;
      else parts.push({ text, changed });
    });
    return parts;
  }
  return { before: compact(left, sameLeft), after: compact(right, sameRight) };
}
