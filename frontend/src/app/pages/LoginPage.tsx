import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Hand, ArrowLeft, Mail, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { authApi } from "../lib/api";

// 页面模式：登录 / 注册 / 找回密码
type Mode = "login" | "register" | "forgot";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [forgotEmailSent, setForgotEmailSent] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  // 如果已登录，直接跳转到首页
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        navigate("/", { replace: true });
      } else {
        setIsCheckingSession(false);
      }
    }).catch(() => {
      if (mounted) setIsCheckingSession(false);
    });
    return () => { mounted = false; };
  }, [navigate]);

  // ── 登录 / 注册提交 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error("请输入邮箱和密码");
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        if (!data.session) throw new Error("登录失败，未获取到会话");
        toast.success("登录成功");
        navigate("/", { replace: true });
      } else {
        // 注册
        if (!formData.name.trim()) {
          toast.error("请输入昵称");
          setIsLoading(false);
          return;
        }
        if (formData.password.length < 6) {
          toast.error("密码至少需要6位");
          setIsLoading(false);
          return;
        }

        let signupResult: any;
        try {
          signupResult = await authApi.signup({
            email: formData.email,
            password: formData.password,
            name: formData.name.trim(),
          });
        } catch (signupError: any) {
          const msg = signupError.message || "";
          if (msg.includes("already registered") || msg.includes("already been registered")) {
            toast.error("该邮箱已注册，请直接登录");
            setMode("login");
            setIsLoading(false);
            return;
          }
          throw signupError;
        }

        if (signupResult?.error) {
          const errMsg = signupResult.error;
          if (errMsg.includes("already registered") || errMsg.includes("already been registered")) {
            toast.error("该邮箱已注册，请直接登录");
            setMode("login");
            setIsLoading(false);
            return;
          }
          throw new Error(errMsg);
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (signInError) throw signInError;
        if (!signInData.session) throw new Error("注册后登录失败");

        toast.success("注册成功，欢迎加入！");
        navigate("/", { replace: true });
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      const msg = error.message || "";
      if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
        toast.error("邮箱或密码错误，请重新输入");
      } else if (msg.includes("Email not confirmed")) {
        toast.error("邮箱尚未验证，请联系管理员");
      } else if (msg.includes("Too many requests")) {
        toast.error("请求过于频繁，请稍后再试");
      } else if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("网络连接失败")) {
        toast.error("网络连接失败，请检查网络后重试");
      } else {
        toast.error(msg || "操作失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── 发送找回密码邮件 ──
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("请输入邮箱地址");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      toast.error("请输入有效的邮箱地址");
      return;
    }

    setIsLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setForgotEmailSent(true);
    } catch (error: any) {
      console.error("[找回密码] 错误:", error);
      const msg = error.message || "";
      if (msg.includes("fetch") || msg.includes("NetworkError")) {
        toast.error("网络连接失败，请稍后再试");
      } else {
        toast.error(msg || "发送失败，请重试");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setForgotEmailSent(false);
    setForgotEmail("");
  };

  // 正在检查会话时显示加载
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-[#F2F2F7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-400">正在加载…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-[#F2F2F7] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        {/* ── 找回密码模式 ── */}
        {mode === "forgot" ? (
          <>
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-[24px] mb-5 shadow-[0_10px_40px_rgba(59,130,246,0.3)]">
                <Hand className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-[26px] font-bold text-gray-900 mb-2 tracking-tight">找回密码</h1>
              <p className="text-[15px] text-gray-500">
                {forgotEmailSent ? "请检查您的邮箱" : "输入注册邮箱，我们将发送重置链接"}
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-8">
              {forgotEmailSent ? (
                /* 发送成功状态 */
                <div className="text-center py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-5">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-[18px] font-semibold text-gray-900 mb-3">邮件已发送</h3>
                  <p className="text-[14px] text-gray-500 mb-1 leading-relaxed">
                    重置链接已发送至：
                  </p>
                  <p className="text-[14px] font-medium text-blue-600 mb-5 break-all">
                    {forgotEmail}
                  </p>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-left mb-6">
                    <p className="text-[13px] text-amber-700 leading-relaxed">
                      💡 请检查收件箱和垃圾邮件文件夹。链接将在 <strong>1小时</strong>内有效，点击链接后可设置新密码。
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setForgotEmailSent(false)}
                    className="text-[14px] text-gray-500 hover:text-gray-700 mb-2 w-full"
                  >
                    未收到？重新发送
                  </Button>
                  <Button
                    onClick={() => switchMode("login")}
                    className="w-full h-12 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[15px] font-medium"
                  >
                    返回登录
                  </Button>
                </div>
              ) : (
                /* 邮箱输入表单 */
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <label className="block text-[14px] font-medium text-gray-700 mb-2 ml-1">
                      注册邮箱
                    </label>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="请输入您的注册邮箱"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="h-14 rounded-2xl bg-[#F2F2F7] border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] pl-11 pr-4"
                      />
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[16px] font-medium shadow-[0_4px_14px_0_rgb(59,130,246,0.39)] transition-all active:scale-[0.98]"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        发送中…
                      </span>
                    ) : (
                      "发送重置邮件"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="w-full flex items-center justify-center gap-1.5 text-[14px] text-gray-500 hover:text-gray-700 transition-colors pt-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    返回登录
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          /* ── 登录 / 注册模式 ── */
          <>
            {/* Logo */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-500 rounded-[28px] mb-5 shadow-[0_10px_40px_rgba(59,130,246,0.3)]">
                <Hand className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-[28px] font-bold text-gray-900 mb-2 tracking-tight">手语助手</h1>
              <p className="text-[15px] text-gray-500">为听障人群打造的无障碍空间</p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-8">
              {/* 登录 / 注册切换 Tab */}
              <div className="flex mb-8 bg-[#F2F2F7] rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className={`flex-1 py-3 text-[15px] font-medium rounded-xl transition-all ${
                    mode === "login"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className={`flex-1 py-3 text-[15px] font-medium rounded-xl transition-all ${
                    mode === "register"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  注册
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 昵称（仅注册） */}
                {mode === "register" && (
                  <div>
                    <label className="block text-[14px] font-medium text-gray-700 mb-2 ml-1">
                      昵称
                    </label>
                    <Input
                      type="text"
                      placeholder="请输入您的昵称"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-14 rounded-2xl bg-[#F2F2F7] border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] px-4"
                    />
                  </div>
                )}

                {/* 邮箱 */}
                <div>
                  <label className="block text-[14px] font-medium text-gray-700 mb-2 ml-1">
                    邮箱
                  </label>
                  <Input
                    type="email"
                    placeholder="请输入邮箱地址"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-14 rounded-2xl bg-[#F2F2F7] border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-[15px] px-4"
                  />
                </div>

                {/* 密码 */}
                <div>
                  <div className="flex items-center justify-between mb-2 ml-1">
                    <label className="text-[14px] font-medium text-gray-700">密码</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-[13px] text-blue-500 hover:text-blue-600 font-medium transition-colors"
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "login" ? "请输入密码" : "请设置密码（至少6位）"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

                {/* 提交 */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[16px] font-medium mt-8 shadow-[0_4px_14px_0_rgb(59,130,246,0.39)] transition-all active:scale-[0.98]"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      处理中…
                    </span>
                  ) : (
                    mode === "login" ? "登录" : "注册并登录"
                  )}
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
