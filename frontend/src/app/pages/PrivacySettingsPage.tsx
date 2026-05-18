import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Shield, Eye, Bell, Lock, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";

export default function PrivacySettingsPage() {
  const navigate = useNavigate();
  const [saveHistory, setSaveHistory] = useState(true);
  const [allowCamera, setAllowCamera] = useState(true);
  const [allowMicrophone, setAllowMicrophone] = useState(true);
  const [showOnline, setShowOnline] = useState(true);

  const handleClearHistory = () => {
    if (confirm("确定要清除所有历史记录吗？此操作无法撤销。")) {
      localStorage.removeItem("ocrHistory");
      toast.success("历史记录已清除");
    }
  };

  const handleClearCache = () => {
    if (confirm("确定要清除所有缓存数据吗？")) {
      // 清除缓存逻辑
      toast.success("缓存已清除");
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* iOS Style Header */}
      <div className="bg-white/80 backdrop-blur-md px-4 pt-14 pb-4 shadow-sm sticky top-0 z-50 flex items-center justify-center border-b border-gray-100">
        <div className="w-full max-w-2xl flex items-center justify-between relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black mx-auto">隐私与安全</h1>
        </div>
      </div>

      <div className="p-4 space-y-3 w-full max-w-2xl mx-auto">
        {/* 数据隐私 */}
        <div className="bg-white rounded-[14px] p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[28px] h-[28px] bg-blue-100 rounded-[7px] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <h2 className="text-[15px] font-bold text-gray-900">数据隐私</h2>
          </div>

          <div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <p className="text-[14px] font-medium text-black">保存识别历史</p>
                <p className="text-[12px] text-gray-500 mt-0.5">在本地保存OCR和手语识别历史</p>
              </div>
              <Switch checked={saveHistory} onCheckedChange={setSaveHistory} className="scale-90" />
            </div>

            <div className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-[14px] font-medium text-black">显示在线状态</p>
                <p className="text-[12px] text-gray-500 mt-0.5">在社区中显示您的在线状态</p>
              </div>
              <Switch checked={showOnline} onCheckedChange={setShowOnline} className="scale-90" />
            </div>
          </div>
        </div>

        {/* 权限管理 */}
        <div className="bg-white rounded-[14px] p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[28px] h-[28px] bg-green-100 rounded-[7px] flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-green-500" />
            </div>
            <h2 className="text-[15px] font-bold text-gray-900">权限管理</h2>
          </div>

          <div>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <p className="text-[14px] font-medium text-black">相机权限</p>
                <p className="text-[12px] text-gray-500 mt-0.5">用于拍照和手语识别</p>
              </div>
              <Switch checked={allowCamera} onCheckedChange={setAllowCamera} className="scale-90" />
            </div>

            <div className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-[14px] font-medium text-black">麦克风权限</p>
                <p className="text-[12px] text-gray-500 mt-0.5">用于环境音检测</p>
              </div>
              <Switch checked={allowMicrophone} onCheckedChange={setAllowMicrophone} className="scale-90" />
            </div>
          </div>
        </div>

        {/* 数据管理 */}
        <div className="bg-white rounded-[14px] p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[28px] h-[28px] bg-amber-100 rounded-[7px] flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <h2 className="text-[15px] font-bold text-gray-900">数据管理</h2>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleClearHistory}
              variant="outline"
              className="w-full h-10 rounded-[10px] justify-between px-3.5 bg-transparent border-gray-200"
            >
              <span className="text-[14px] font-medium text-black">清除历史记录</span>
              <Trash2 className="w-4 h-4 text-gray-400" />
            </Button>

            <Button
              onClick={handleClearCache}
              variant="outline"
              className="w-full h-10 rounded-[10px] justify-between px-3.5 bg-transparent border-gray-200"
            >
              <span className="text-[14px] font-medium text-black">清除缓存数据</span>
              <Trash2 className="w-4 h-4 text-gray-400" />
            </Button>
          </div>
        </div>

        {/* 隐私说明 */}
        <div className="bg-blue-50 rounded-[14px] p-3.5">
          <h3 className="text-[14px] font-bold text-gray-900 mb-1.5">隐私保护</h3>
          <p className="text-[13px] text-gray-700 leading-relaxed">
            我们重视您的隐私。所有识别和处理过程都在本地完成，不会上传任何个人数据到服务器。
            您的照片、语音和其他信息仅保存在您的设备上。
          </p>
        </div>
      </div>
    </div>
  );
}