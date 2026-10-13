export function nextReceiptCode(receipts: { code: string }[], year = new Date().getFullYear()): string {
  const prefix = `PT-${year}-`;
  const maximum = receipts.reduce((max, receipt) => {
    if (!receipt.code.startsWith(prefix)) return max;
    const suffix = receipt.code.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(4, '0')}`;
}
