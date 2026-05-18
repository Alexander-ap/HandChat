/**
 * 编辑个人资料页面
 * 
 * 功能: 头像上传、昵称/简介/手机/位置修改
 * 头像通过 Supabase Storage 上传后更新到用户 metadata
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { userApi, uploadApi } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const meta = session.user.user_metadata || {};
          setUsername(meta.name || "");
          setAvatarUrl(meta.avatar_url || "");
          setBio(meta.bio || "");
          setPhone(meta.phone || "");
          setLocation(meta.location || "");
        }
      } catch (error) {
        console.error("[编辑资料] 获取会话失败:", error);
      }
    };
    fetchUser();
  }, []);

  /** 头像上传处理 */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 文件大小限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过5MB");
      return;
    }

    try {
      setIsUploading(true);
      toast.info("正在上传头像...");
      
      // 先尝试通过服务器API上传
      try {
        const data = await uploadApi.uploadImage(file);
        if (data.url) {
          setAvatarUrl(data.url);
          toast.success("头像上传成功");
          return;
        }
      } catch (serverErr) {
        console.warn("[头像上传] 服务器上传失败，使用本地方案:", serverErr);
      }

      // 兜底方案：转为base64 data URL直接存储到用户metadata
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        // 如果图片太大，先压缩
        try {
          const compressed = await compressImage(dataUrl, 200, 0.8);
          setAvatarUrl(compressed);
          toast.success("头像已设置");
        } catch {
          setAvatarUrl(dataUrl);
          toast.success("头像已设置");
        }
      };
      reader.onerror = () => {
        toast.error("图片读取失败");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("[头像上传] 错误:", error);
      toast.error("头像上传失败，请重试");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** 压缩图片到指定尺寸 */
  const compressImage = (dataUrl: string, maxSize: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject("no ctx"); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  };

  /** 保存资料 */
  const handleSave = async () => {
    if (!username.trim()) {
      toast.error("请输入名称");
      return;
    }
    
    try {
      setIsSaving(true);
      
      // 通过后端 API 更新资料 (使用 admin API 确保可靠性)
      await userApi.updateProfile({
        name: username,
        bio,
        phone,
        location,
        avatar_url: avatarUrl,
      });

      toast.success("个人资料已保存");
      navigate("/profile");
    } catch (error) {
      console.error("[资料保存] 错误:", error);
      toast.error("保存失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

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
            <h1 className="text-[17px] font-semibold text-slate-900">编辑资料</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full px-0 text-[16px] font-semibold text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "完成"}
          </Button>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3 pb-24">
        <div className="app-panel-strong app-grid-glow overflow-hidden rounded-[28px] p-5">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-[3px] border-white shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
              <AvatarImage src={avatarUrl} className="object-cover" />
              <AvatarFallback className="bg-slate-200 text-2xl font-medium text-slate-500">
                {username ? username[0] : "用"}
              </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/28 transition-opacity"
              >
                {isUploading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-white" />
                ) : (
                  <Camera className="w-7 h-7 text-white" />
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("公开资料", "PROFILE IDENTITY")}</p>
              <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">
                {text("调整你的公开资料形象", "Refresh how your public profile appears")}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                {text("头像、昵称与简介会在个人主页和社区中展示，保持简洁清晰更有辨识度。", "Your avatar, display name, and bio appear in your profile and community posts, so keeping them clear improves recognition.")}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-full bg-blue-500/[0.08] px-4 py-2 text-[13px] font-medium text-blue-600 transition hover:bg-blue-500/[0.12]"
              >
                {isUploading ? "上传中..." : "编辑头像"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[20px] border border-white/70 bg-white/60 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <p className="text-[11px] text-slate-400">公开展示</p>
            <p className="mt-1 text-[13px] font-medium text-slate-800">头像与名称</p>
          </div>
          <div className="rounded-[20px] border border-white/70 bg-white/60 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <p className="text-[11px] text-slate-400">社区身份</p>
            <p className="mt-1 text-[13px] font-medium text-slate-800">资料更完整</p>
          </div>
          <div className="rounded-[20px] border border-white/70 bg-white/60 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <p className="text-[11px] text-slate-400">保存后生效</p>
            <p className="mt-1 text-[13px] font-medium text-slate-800">即时更新</p>
          </div>
        </div>

        <div className="app-panel overflow-hidden rounded-[26px] p-2">
          <div className="rounded-[22px] border border-white/70 bg-white/72">
            <div className="flex flex-row items-center px-4 py-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="text-[15px] font-medium text-slate-900 w-20 shrink-0">名称</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="请输入名称"
            />
          </div>
          
            <div className="flex flex-col px-4 py-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="mb-2 text-[15px] font-medium text-slate-900">个人简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[84px] w-full resize-none bg-transparent text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="介绍一下自己..."
            />
          </div>

            <div className="flex flex-row items-center px-4 py-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="text-[15px] font-medium text-slate-900 w-20 shrink-0">手机</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="请输入手机号"
            />
          </div>

            <div className="flex flex-row items-center px-4 py-4">
            <label className="text-[15px] font-medium text-slate-900 w-20 shrink-0">位置</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="请输入所在城市"
            />
          </div>
          </div>
        </div>
        
        <div className="app-panel rounded-[22px] p-4">
          <p className="text-[12px] leading-6 text-slate-500">
            你的名称和头像将公开显示在社区论坛中，请遵守社区规范并尽量保持资料真实、清晰、易识别。
          </p>
        </div>
      </div>
    </div>
  );
}
