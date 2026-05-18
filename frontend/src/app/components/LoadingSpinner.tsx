import { Hand } from "lucide-react";

export default function LoadingSpinner() {
  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-3xl mb-4 animate-pulse">
          <Hand className="w-10 h-10 text-white" />
        </div>
        <p className="text-gray-500 text-sm">加载中...</p>
      </div>
    </div>
  );
}
