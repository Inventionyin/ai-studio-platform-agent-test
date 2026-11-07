import { Component, type ReactNode } from "react";
import { Btn } from "@/components/ui";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen grid place-items-center bg-slate-100 p-6">
        <section className="w-[420px] bg-white rounded-lg border border-slate-200 shadow-sm p-6 text-center">
          <div className="text-base font-semibold text-slate-800">页面出错了</div>
          <div className="text-xs text-slate-500 mt-2 break-all">{this.state.error.message}</div>
          <Btn className="mt-4" onClick={() => window.location.reload()}>刷新页面</Btn>
        </section>
      </div>
    );
  }
}
