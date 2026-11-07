import { Link } from "react-router-dom";
import { Card } from "@/components/ui";

export function NotFound() {
  return (
    <div className="h-screen grid place-items-center bg-slate-100 p-6">
      <Card className="w-96 text-center">
        <div className="text-4xl font-semibold text-slate-300">404</div>
        <div className="text-sm font-medium mt-2">页面不存在</div>
        <div className="text-xs text-slate-500 mt-1">链接可能已失效，或页面尚未接入路由。</div>
        <Link to="/dashboard" className="inline-flex mt-4 h-8 px-3 items-center rounded-md bg-blue-600 text-white text-xs hover:bg-blue-500">返回工作台</Link>
      </Card>
    </div>
  );
}
