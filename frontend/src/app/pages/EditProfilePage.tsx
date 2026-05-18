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

export default function EditProfilePage() {
  const navigate = useNavigate();
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
          <h1 className="text-[17px] font-semibold text-black">编辑资料</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-semibold text-[17px]"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "完成"}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3 w-full max-w-2xl mx-auto pb-24">
        {/* 头像区域 */}
        <div className="flex flex-col items-center mt-4 mb-4">
          <div className="relative group">
            <Avatar className="w-24 h-24 border-2 border-white shadow-sm">
              <AvatarImage src={avatarUrl} className="object-cover" />
              <AvatarFallback className="bg-gray-200 text-gray-500 text-2xl font-medium">
                {username ? username[0] : "用"}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center"
            >
              {isUploading ? (
                <Loader2 className="w-7 h-7 text-white animate-spin" />
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 text-[14px] font-medium text-blue-500 active:opacity-70"
          >
            {isUploading ? "上传中..." : "编辑头像"}
          </button>
        </div>

        {/* 表单 */}
        <div className="bg-white rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex flex-row items-center px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="text-[15px] text-black w-20 shrink-0">名称</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 text-[15px] text-black bg-transparent outline-none placeholder-gray-400"
              placeholder="请输入名称"
            />
          </div>
          
          <div className="flex flex-col px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="text-[15px] text-black mb-1.5">个人简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full text-[15px] text-black bg-transparent outline-none placeholder-gray-400 min-h-[70px] resize-none"
              placeholder="介绍一下自己..."
            />
          </div>

          <div className="flex flex-row items-center px-4 py-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <label className="text-[15px] text-black w-20 shrink-0">手机</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 text-[15px] text-black bg-transparent outline-none placeholder-gray-400"
              placeholder="请输入手机号"
            />
          </div>

          <div className="flex flex-row items-center px-4 py-3">
            <label className="text-[15px] text-black w-20 shrink-0">位置</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 text-[15px] text-black bg-transparent outline-none placeholder-gray-400"
              placeholder="请输入所在城市"
            />
          </div>
        </div>
        
        <p className="text-[12px] text-gray-500 px-4">
          你的名称和头像将公开显示在社区论坛中，请遵守社区规范。
        </p>
      </div>
    </div>
  );
}