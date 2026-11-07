import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

/* ---------------- Card ---------------- */
export function Card({ title, extra, children, className }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("bg-white rounded-lg border border-slate-200 shadow-sm", className)}>
      {title && (
        <header className="flex items-center justify-between px-4 h-11 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {extra}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ---------------- Button ---------------- */
export function Btn({ v = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { v?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...p}
      className={cx(
        "h-8 px-3 rounded-md text-xs font-medium transition disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        v === "primary" && "bg-blue-600 text-white hover:bg-blue-500",
        v === "ghost" && "border border-slate-300 text-slate-700 bg-white hover:border-blue-500 hover:text-blue-600",
        v === "danger" && "text-rose-600 hover:bg-rose-50",
        className,
      )}
    />
  );
}

/* ---------------- Tag ---------------- */
export type Tone = "green" | "red" | "amber" | "blue" | "gray";
const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
};
export const tone = (t: string): Tone =>
  /通过|成功|在线|已发布|已解析|正常|启用|已完成/.test(t)
    ? "green"
    : /失败|P0|离线|异常|驳回|高危/.test(t)
      ? "red"
      : /中|待|P1|警告/.test(t)
        ? "amber"
        : /P2|GET/.test(t)
          ? "blue"
          : "gray";
export function Tag({ t, c }: { t: string; c?: Tone }) {
  return <span className={cx("inline-flex px-1.5 py-0.5 rounded text-[11px] ring-1 ring-inset", TONE_CLASS[c ?? tone(t)])}>{t}</span>;
}

/* ---------------- Form ---------------- */
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx("h-8 px-2.5 rounded-md border border-slate-300 text-xs outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100", p.className)} />;
}

export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx("px-2.5 py-2 rounded-md border border-slate-300 text-xs outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100", p.className)} />;
}

export function Select({ opts, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { opts: string[] }) {
  return (
    <select {...p} className={cx("h-8 px-2 rounded-md border border-slate-300 text-xs bg-white", className)}>
      {opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

export function Field({ label, hint, children, className, as = "label" }: { label: string; hint?: string; children: ReactNode; className?: string; as?: "label" | "div" }) {
  const Wrapper = as;
  return (
    <Wrapper className={cx("block text-xs", className)}>
      <span className="block text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </Wrapper>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx("relative w-9 h-5 rounded-full transition", checked ? "bg-blue-600" : "bg-slate-300")}>
      <span className={cx("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

/* ---------------- Stat / Bars / Empty / Progress ---------------- */
export function Stat({ label, value, delta, up = true }: { label: string; value: ReactNode; delta?: string; up?: boolean }) {
  return (
    <Card>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {delta && <span className={cx("text-xs", up ? "text-emerald-600" : "text-rose-600")}>{up ? "↑" : "↓"} {delta}</span>}
      </div>
    </Card>
  );
}

export function Bars({ data, color = "bg-blue-500", labels }: { data: number[]; color?: string; labels?: string[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-2 h-36">
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className={cx("w-full rounded-t", color)} style={{ height: `${(v / max) * 100}%` }} title={String(v)} />
          <span className="text-[10px] text-slate-500">{labels?.[i] ?? ["一", "二", "三", "四", "五", "六", "日"][i] ?? i + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ text = "暂无数据", className }: { text?: string; className?: string }) {
  return <div className={cx("h-60 grid place-items-center text-xs text-slate-500", className)}>{text}</div>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-1.5 bg-slate-100 rounded", className)}>
      <div className={cx("h-1.5 rounded transition-all", value >= 100 ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
