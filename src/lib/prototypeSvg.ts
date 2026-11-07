import type { Prototype } from "@/api/types";

export function prototypeToSvg(prototype: Prototype): { svg: string; width: number; height: number } {
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const width = 360;
  const rowHeight = 40;
  const pageGap = 20;
  const pages = prototype.pages ?? [];
  let y = 52;
  const blocks: string[] = [];
  pages.forEach((page, index) => {
    blocks.push(`<text x="16" y="${y + 14}" font-size="12" font-weight="600" fill="#1e293b">${index + 1}. ${esc(page.name)}</text>`);
    y += 22;
    page.sections.forEach((section) => {
      blocks.push(`<rect x="16" y="${y}" width="328" height="32" rx="6" fill="#fff" stroke="#94a3b8" stroke-dasharray="4 3"/>`);
      blocks.push(`<text x="26" y="${y + 14}" font-size="10" fill="#475569">${esc(section.name)}</text>`);
      blocks.push(`<text x="26" y="${y + 26}" font-size="9" fill="#64748b">${esc(section.items.join(" / "))}</text>`);
      y += rowHeight;
    });
    y += pageGap;
  });
  const height = Math.max(y, 120);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    <text x="16" y="24" font-size="13" font-weight="600" fill="#1e293b">${esc(prototype.flow || "原型")}</text>
    <text x="16" y="40" font-size="9" fill="#64748b">${pages.length} 个页面</text>
    ${blocks.join("")}
  </svg>`;
  return { svg, width, height };
}
