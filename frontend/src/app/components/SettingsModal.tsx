import { X, Bell, Smartphone, Moon, Globe, Info } from "lucide-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { useState } from "react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState({
    notifications: true,
    vibration: true,
    flashlight: true,
    darkMode: false,
    autoStart: true,
  });

  if (!open) return null;

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">通知设置</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 提醒方式 */}
          <div>
            <h3 className="font-medium text-gray-900 mb-4">提醒方式</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">推送通知</p>
                    <p className="text-xs text-gray-500">接收系统通知提醒</p>
                  </div>
                </div>
                <Switch
                  checked={settings.notifications}
                  onCheckedChange={() => toggleSetting("notifications")}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="font-medium text-gray-900">震动提醒</p>
                    <p className="text-xs text-gray-500">检测到声音时震动</p>
                  </div>
                </div>
                <Switch
                  checked={settings.vibration}
                  onCheckedChange={() => toggleSetting("vibration")}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-gray-900">闪光提醒</p>
                    <p className="text-xs text-gray-500">屏幕闪烁提示</p>
                  </div>
                </div>
                <Switch
                  checked={settings.flashlight}
                  onCheckedChange={() => toggleSetting("flashlight")}
                />
              </div>
            </div>
          </div>

          {/* 应用设置 */}
          <div>
            <h3 className="font-medium text-gray-900 mb-4">应用设置</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-indigo-500" />
                  <div>
                    <p className="font-medium text-gray-900">深色模式</p>
                    <p className="text-xs text-gray-500">保护眼睛，节省电量</p>
                  </div>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onCheckedChange={() => toggleSetting("darkMode")}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900">开机自启动</p>
                    <p className="text-xs text-gray-500">打开应用自动启动监听</p>
                  </div>
                </div>
                <Switch
                  checked={settings.autoStart}
                  onCheckedChange={() => toggleSetting("autoStart")}
                />
              </div>
            </div>
          </div>

          {/* 说明 */}
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-800 leading-relaxed">
              💡 提示：开启多种提醒方式可以确保您不会错过重要信息。建议同时开启震动和闪光提醒。
            </p>
          </div>

          {/* 按钮 */}
          <Button
            onClick={onClose}
            className="w-full h-12 bg-blue-500 hover:bg-blue-600 rounded-xl"
          >
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}
