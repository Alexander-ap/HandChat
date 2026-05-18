import React, { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye, EyeOff, CheckCircle, Loader2, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const passwordStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { level: 1, label: "弱", color: "bg-red-400" };
    if (score <= 3) return { level: 2, label: "中", color: "bg-yellow-400" };
    return { level: 3, label: "强", color: "bg-green-500" };
  };

  const strength = passwordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("请填写所有字段");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("新密码至少需要6位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("新密码不能与当前密码相同");
      return;
    }

    setIsLoading(true);
    try {
      // 第一步：用当前密码重新验证身份
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        throw new Error("无法获取当前用户信息，请重新登录");
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });

      if (verifyError) {
        toast.error("当前密码错误，请重新输入");
        setIsLoading(false);
        return;
      }

      // 第二步：更新为新密码
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setIsSuccess(true);
      toast.success("密码已成功修改");
    } catch (error: any) {
      console.error("[修改密码] 错误:", error);
      const msg = error.message || "";
      if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
        toast.error("当前密码错误，请重新输入");
      } else if (msg.includes("same password")) {
        toast.error("新密码不能与当前密码相同");
      } else {
        toast.error(msg || "修改失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── 修改成功状态 ──
  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--app-background, #F2F2F7)' }}>
        {/* 头部 */}
        <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex justify-center border-b border-black/5">
          <div className="w-full max-w-2xl flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/profile")}
              className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px]"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              返回
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-6 shadow-sm">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-[24px] font-bold text-gray-900 mb-3">密码修改成功</h2>
            <p className="text-[15px] text-gray-500 mb-8 leading-relaxed max-w-xs mx-auto">
              您的密码已更新，下次登录时请使用新密码。
            </p>
            <Button
              onClick={() => navigate("/profile")}
              className="w-48 h-13 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[15px] font-medium shadow-[0_4px_14px_0_rgb(59,130,246,0.35)]"
            >
              返回个人中心
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── 主表单 ──
  return (
    <div className="min-h-screen" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* iOS 风格头部 */}
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex justify-center border-b border-black/5">
        <div className="w-full max-w-2xl flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px]"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black">修改密码</h1>
          <div className="w-14" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-20 w-full max-w-2xl mx-auto space-y-3">
        {/* 提示信息 */}
        <div className="bg-blue-50 border border-blue-100 rounded-[14px] px-4 py-3 flex items-start gap-3">
          <Lock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-blue-700 leading-relaxed">
            为保障账号安全，修改密码需要验证当前密码。新密码修改后立即生效。
          </p>
        </div>

        {/* 表单卡片 */}
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {/* 当前密码 */}
            <PasswordField
              label="当前密码"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(!showCurrent)}
              placeholder="请输入当前密码"
              hasBorder
            />

            {/* 分割线 + 新密码区域 */}
            <div className="h-px bg-gray-100 mx-4" />

            {/* 新密码 */}
            <PasswordField
              label="新密码"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew(!showNew)}
              placeholder="至少6位字符"
              hasBorder
            />

            {/* 密码强度指示器 */}
            {newPassword.length > 0 && (
              <div className="px-4 pb-3 -mt-1">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3].map((lvl) => (
                      <div
                        key={lvl}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          strength.level >= lvl ? strength.color : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-[12px] font-medium ${
                    strength.level === 1 ? "text-red-400" :
                    strength.level === 2 ? "text-yellow-500" : "text-green-500"
                  }`}>
                    强度：{strength.label}
                  </span>
                </div>
              </div>
            )}

            {/* 确认新密码 */}
            <div className="h-px bg-gray-100 mx-4" />
            <PasswordField
              label="确认新密码"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(!showConfirm)}
              placeholder="再次输入新密码"
            />

            {/* 一致性提示 */}
            {confirmPassword.length > 0 && (
              <div className="px-4 pb-3 -mt-1">
                <p className={`text-[12px] ${newPassword === confirmPassword ? "text-green-500" : "text-red-400"}`}>
                  {newPassword === confirmPassword ? "✓ 两次密码一致" : "✗ 密码不一致"}
                </p>
              </div>
            )}
          </div>

          {/* 提交按钮 */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 rounded-[14px] bg-blue-500 hover:bg-blue-600 text-white text-[16px] font-medium mt-5 shadow-[0_4px_14px_0_rgb(59,130,246,0.35)] transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                验证中…
              </span>
            ) : (
              "确认修改密码"
            )}
          </Button>
        </form>

        <p className="text-[12px] text-gray-400 text-center px-4 mt-2">
          忘记当前密码？可在登录页使用「找回密码」功能通过邮箱重置。
        </p>
      </div>
    </div>
  );
}

// ── 密码输入行组件 ──
interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
  hasBorder?: boolean;
}

function PasswordField({ label, value, onChange, show, onToggleShow, placeholder, hasBorder }: PasswordFieldProps) {
  return (
    <div
      className="flex items-center px-4 py-3.5"
      style={hasBorder ? {} : {}}
    >
      <span className="text-[15px] text-black w-24 shrink-0 font-medium">{label}</span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-[15px] text-black bg-transparent outline-none placeholder-gray-400 min-w-0"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="ml-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
      >
        {show ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
      </button>
    </div>
  );
}