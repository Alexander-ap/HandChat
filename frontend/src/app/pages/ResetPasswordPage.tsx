import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Hand, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

type PageState = "loading" | "ready" | "success" | "invalid";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    // onAuthStateChange 会自动解析 URL hash 里的 access_token
    // PASSWORD_RECOVERY 事件代表用户点击了重置邮件中的链接
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        // 用户通过邮件链接进入，session 已建立
        setPageState("ready");
      } else if (event === "INITIAL_SESSION") {
        // 首次加载：如果已有有效 session，也允许重置（兼容直接刷新场景）
        if (session) {
          setPageState("ready");
        } else {
          // 无 session 且不是 PASSWORD_RECOVERY，说明链接无效或已过期
          // 等待一段时间再判断，给 PASSWORD_RECOVERY 时间触发
          setTimeout(() => {
            if (mounted) {
              setPageState((prev) => prev === "loading" ? "invalid" : prev);
            }
          }, 3000);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast.error("请填写所有字段");
      return;
    }
    if (password.length < 6) {
      toast.error("新密码至少需要6位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPageState("success");
      toast.success("密码重置成功！");
      // 退出当前 recovery session，让用户重新用新密码登录
      await supabase.auth.signOut();
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (error: any) {
      console.error("[重置密码] 错误:", error);
      const msg = error.message || "";
      if (msg.includes("expired") || msg.includes("invalid")) {
        toast.error("重置链接已过期，请重新申请");
        setPageState("invalid");
      } else {
        toast.error(msg || "密码重置失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── 加载中 ──
  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-[#F2F2F7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-400">正在验证重置链接…</p>
        </div>
      </div>
    );
  }

  // ── 链接无效 ──
  if (pageState === "invalid") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-[#F2F2F7] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 mb-3">链接已失效</h1>
          <p className="text-[15px] text-gray-500 mb-8 leading-relaxed">
            密码重置链接已过期或无效，请重新申请找回密码。
          </p>
          <Button
            onClick={() => navigate("/login", { replace: true })}
            className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[16px] font-medium"
          >
            返回登录页
          </Button>
        </div>
      </div>
    );
  }

  // ── 重置成功 ──
  if (pageState === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-[#F2F2F7] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-[24px] font-bold text-gray-900 mb-3">密码已重置</h1>
          <p className="text-[15px] text-gray-500 mb-2 leading-relaxed">
            您的密码已成功更新，即将跳转到登录页…
          </p>
          <div className="flex justify-center mt-4">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  // ── 主表单 ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-[24px] mb-5 shadow-[0_10px_40px_rgba(59,130,246,0.3)]">
            <Hand className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-[26px] font-bold text-gray-900 mb-2 tracking-tight">设置新密码</h1>
          <p className="text-[15px] text-gray-500">请输入您的新密码，至少6位字符</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 新密码 */}
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2 ml-1">
                新密码
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入新密码（至少6位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-[#F2F2F7] border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] px-4 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-[14px] font-medium text-gray-700 mb-2 ml-1">
                确认新密码
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-[#F2F2F7] border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] px-4 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {/* 密码一致性提示 */}
              {confirmPassword && (
                <p className={`text-[12px] mt-1.5 ml-1 ${password === confirmPassword ? "text-green-500" : "text-red-400"}`}>
                  {password === confirmPassword ? "✓ 两次密码一致" : "✗ 密码不一致"}
                </p>
              )}
            </div>

            {/* 提交 */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[16px] font-medium mt-4 shadow-[0_4px_14px_0_rgb(59,130,246,0.39)] transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在更新…
                </span>
              ) : (
                "确认重置密码"
              )}
            </Button>
          </form>

          {/* 返回登录 */}
          <div className="text-center mt-6">
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="text-[14px] text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
