import type { ReactNode } from "react";
import { Drawer } from "@/components/ui";

export function DetailDrawer({ open, title, onClose, fields, children, footer, width }: {
  open: boolean;
  title: string;
  onClose: () => void;
  fields?: { label: string; value: ReactNode }[];
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <Drawer open={open} title={title} onClose={onClose} footer={footer} width={width}>
      {fields && fields.length > 0 && (
        <dl className="text-xs space-y-2.5">
          {fields.map((f) => (
            <div key={f.label} className="flex justify-between gap-4">
              <dt className="text-slate-500 shrink-0">{f.label}</dt>
              <dd className="text-right text-slate-800 break-all">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="mt-4 pt-4 border-t border-slate-100">{children}</div>}
    </Drawer>
  );
}
