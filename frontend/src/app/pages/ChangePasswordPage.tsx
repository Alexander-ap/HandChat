import React, { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye, EyeOff, CheckCircle, Loader2, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
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
        <div className="app-topbar sticky top-0 z-50 flex justify-center px-4 pt-10 pb-4">
          <div className="w-full max-w-2xl flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/profile")}
              className="rounded-full px-0 text-[16px] font-medium text-blue-500 hover:bg-transparent hover:text-blue-600"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              返回
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="app-panel-strong app-grid-glow w-full max-w-lg rounded-[32px] p-8 text-center">
            <div className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-green-500/[0.12] mb-6 shadow-[0_18px_36px_rgba(34,197,94,0.14)]">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <p className="text-[12px] font-semibold tracking-[0.16em] text-green-600">{text("安全更新", "SECURITY UPDATED")}</p>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-slate-900">密码修改成功</h2>
            <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
              您的密码已更新，下次登录时请使用新密码。
            </p>
            <Button
              onClick={() => navigate("/profile")}
              className="mt-8 h-13 w-48 rounded-2xl bg-blue-500 text-[15px] font-medium text-white shadow-[0_8px_20px_rgba(59,130,246,0.28)] hover:bg-blue-600"
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
      <div className="app-topbar sticky top-0 z-50 flex justify-center px-4 pt-10 pb-4">
        <div className="w-full max-w-2xl flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="rounded-full px-0 text-[16px] font-medium text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <div className="text-center">
            <h1 className="text-[17px] font-semibold text-slate-900">修改密码</h1>
          </div>
          <div className="w-14" />
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3 pb-20">
        <div className="app-panel-strong app-grid-glow rounded-[28px] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-blue-500/[0.08] text-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("密码流程", "PASSWORD FLOW")}</p>
              <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">更新账号登录凭证</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                为保障账号安全，修改密码前需要验证当前密码。新密码保存后会立即生效。
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">步骤 1</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">验证当前密码</p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">步骤 2</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">设置新密码</p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">即时生效</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">下次登录使用</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="app-panel overflow-hidden rounded-[26px] p-2">
            <div className="rounded-[22px] border border-white/70 bg-white/72">
            <PasswordField
              label="当前密码"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(!showCurrent)}
              placeholder="请输入当前密码"
              hasBorder
            />

            <div className="h-px bg-gray-100 mx-4" />

            <PasswordField
              label="新密码"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew(!showNew)}
              placeholder="至少6位字符"
              hasBorder
            />

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

            <div className="h-px bg-gray-100 mx-4" />
            <PasswordField
              label="确认新密码"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(!showConfirm)}
              placeholder="再次输入新密码"
            />

            {confirmPassword.length > 0 && (
              <div className="px-4 pb-3 -mt-1">
                <p className={`text-[12px] ${newPassword === confirmPassword ? "text-green-500" : "text-red-400"}`}>
                  {newPassword === confirmPassword ? "✓ 两次密码一致" : "✗ 密码不一致"}
                </p>
              </div>
            )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="mt-5 h-14 w-full rounded-[18px] bg-blue-500 text-[16px] font-medium text-white shadow-[0_8px_20px_rgba(59,130,246,0.28)] transition-all active:scale-[0.98] hover:bg-blue-600"
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

        <p className="px-4 mt-2 text-center text-[12px] text-gray-400">
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
    <div className="flex items-center px-4 py-4" style={hasBorder ? {} : {}}>
      <span className="w-24 shrink-0 text-[15px] font-medium text-slate-900">{label}</span>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="ml-2 flex-shrink-0 text-gray-400 transition-colors hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
      </button>
    </div>
  );
}
