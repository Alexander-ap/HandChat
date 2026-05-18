import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Shield, Lock, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";

export default function PrivacySettingsPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
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
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-10 pb-4">
        <div className="relative w-full max-w-2xl flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="absolute left-0 rounded-full px-0 text-[16px] font-medium text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <div className="mx-auto text-center">
            <h1 className="text-[17px] font-semibold text-slate-900">隐私与安全</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        <div className="app-panel-strong app-grid-glow rounded-[28px] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-blue-500/[0.08] text-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("数据保护", "DATA PROTECTION")}</p>
              <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">管理权限、历史与隐私偏好</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                所有设置都围绕本地体验与数据可控展开，便于你随时调整保留内容与访问权限。
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">识别记录</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">本地可控</p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">设备权限</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">相机 / 麦克风</p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">安全策略</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">随时可调整</p>
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[30px] h-[30px] bg-blue-100 rounded-[10px] flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-900">数据隐私</h2>
          </div>

          <div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <p className="text-[14px] font-medium text-slate-900">保存识别历史</p>
                <p className="text-[12px] text-slate-500 mt-0.5">在本地保存 OCR 和手语识别历史</p>
              </div>
              <Switch checked={saveHistory} onCheckedChange={setSaveHistory} className="scale-90" />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium text-slate-900">显示在线状态</p>
                <p className="text-[12px] text-slate-500 mt-0.5">在社区中显示您的在线状态</p>
              </div>
              <Switch checked={showOnline} onCheckedChange={setShowOnline} className="scale-90" />
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[30px] h-[30px] bg-emerald-100 rounded-[10px] flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-green-500" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-900">权限管理</h2>
          </div>

          <div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <p className="text-[14px] font-medium text-slate-900">相机权限</p>
                <p className="text-[12px] text-slate-500 mt-0.5">用于拍照和手语识别</p>
              </div>
              <Switch checked={allowCamera} onCheckedChange={setAllowCamera} className="scale-90" />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-[14px] font-medium text-slate-900">麦克风权限</p>
                <p className="text-[12px] text-slate-500 mt-0.5">用于环境音检测</p>
              </div>
              <Switch checked={allowMicrophone} onCheckedChange={setAllowMicrophone} className="scale-90" />
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-[30px] h-[30px] bg-amber-100 rounded-[10px] flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-900">数据管理</h2>
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleClearHistory}
              variant="outline"
              className="w-full h-11 rounded-[14px] justify-between border-slate-200 bg-white/70 px-4"
            >
              <span className="text-[14px] font-medium text-slate-900">清除历史记录</span>
              <Trash2 className="w-4 h-4 text-slate-400" />
            </Button>

            <Button
              onClick={handleClearCache}
              variant="outline"
              className="w-full h-11 rounded-[14px] justify-between border-slate-200 bg-white/70 px-4"
            >
              <span className="text-[14px] font-medium text-slate-900">清除缓存数据</span>
              <Trash2 className="w-4 h-4 text-slate-400" />
            </Button>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-4">
          <h3 className="text-[14px] font-bold text-slate-900 mb-1.5">隐私保护</h3>
          <p className="text-[13px] leading-relaxed text-slate-600">
            我们重视您的隐私。所有识别和处理过程都在本地完成，不会上传任何个人数据到服务器。
            您的照片、语音和其他信息仅保存在您的设备上。
          </p>
        </div>
      </div>
    </div>
  );
}
