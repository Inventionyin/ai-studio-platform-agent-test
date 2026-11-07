export type DiffLine = { type: "same" | "add" | "del"; text: string };

export function diffLines(leftText: string, rightText: string): DiffLine[] {
  const a = leftText.split("\n");
  const b = rightText.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return [{ type: "same", text: `文件较大（${n} × ${m} 行），已跳过逐行差异。请改用原文对照或缩小版本范围。` }];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) { out.push({ type: "del", text: a[i] }); i += 1; }
  while (j < m) { out.push({ type: "add", text: b[j] }); j += 1; }
  return out;
}
