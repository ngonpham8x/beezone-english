/** Keep the legacy comma-separated format, including commas inside category names in parentheses. */
export function splitProgramCategories(value: string = ''): string[] {
  const categories: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '(') depth++;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      categories.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  categories.push(value.slice(start).trim());
  return [...new Set(categories.filter(Boolean))];
}
