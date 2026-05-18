/**
 * 手语图库管理组件
 *
 * 用户可以为每个手语词条上传对应的图片。
 * 图片存储在 localStorage 中（base64 data URL）。
 */

import { useState, useRef, useEffect } from "react";
import {
  Upload, Trash2, CheckCircle, Image as ImageIcon,
  AlertCircle, X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { toast } from "sonner";
import {
  SIGN_WORDS,
  loadSignLibrary,
  saveSignImage,
  removeSignImage,
  fileToDataUrl,
} from "../lib/signLanguageStore";

interface SignLibraryManagerProps {
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void; // 当图库更新时的回调
}

export default function SignLibraryManager({ open, onClose, onUpdate }: SignLibraryManagerProps) {
  const [library, setLibrary] = useState<Record<string, string | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentWordRef = useRef<string>("");

  // 打开时加载图库
  useEffect(() => {
    if (open) {
      setLibrary(loadSignLibrary());
    }
  }, [open]);

  const uploadedCount = Object.values(library).filter(v => v !== null).length;

  const handleClickUpload = (word: string) => {
    currentWordRef.current = word;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const word = currentWordRef.current;
    if (!word) return;

    // 检查文件大小(限制 2MB，因为存 localStorage)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      e.target.value = "";
      return;
    }

    try {
      setUploading(word);
      const dataUrl = await fileToDataUrl(file);
      saveSignImage(word, dataUrl);
      setLibrary(prev => ({ ...prev, [word]: dataUrl }));
      toast.success(`"${word}" 的手语图片已设置`);
      onUpdate?.();
    } catch (err) {
      toast.error("图片读取失败");
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  };

  const handleRemove = (word: string) => {
    removeSignImage(word);
    setLibrary(prev => ({ ...prev, [word]: null }));
    toast.success(`已移除 "${word}" 的图片`);
    onUpdate?.();
  };

  /** 批量上传：选择多个文件，按文件名自动匹配词条 */
  const batchInputRef = useRef<HTMLInputElement>(null);

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let matched = 0;
    let failed = 0;
    const wordSet = new Set<string>(SIGN_WORDS);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // 从文件名中提取词条名（去掉扩展名）
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").trim();

      if (wordSet.has(nameWithoutExt)) {
        try {
          if (file.size > 2 * 1024 * 1024) {
            failed++;
            continue;
          }
          const dataUrl = await fileToDataUrl(file);
          saveSignImage(nameWithoutExt, dataUrl);
          setLibrary(prev => ({ ...prev, [nameWithoutExt]: dataUrl }));
          matched++;
        } catch {
          failed++;
        }
      } else {
        failed++;
      }
    }

    if (matched > 0) {
      toast.success(`成功导入 ${matched} 张图片${failed > 0 ? `，${failed} 张未匹配` : ""}`);
      onUpdate?.();
    } else {
      toast.error(`没有匹配的图片。请确保文件名为词条名称，如 "你好.png"、"谢谢.jpg"`);
    }
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[24px] p-0 bg-white border-0 shadow-2xl max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold text-center">手语图库管理</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-500 text-center">
              为每个词条上传对应的手语图片
            </DialogDescription>
          </DialogHeader>

          {/* 统计 */}
          <div className="mt-3 flex items-center justify-between bg-blue-50 rounded-[12px] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-500" />
              <span className="text-[13px] text-gray-700">
                已上传 <strong className="text-blue-600">{uploadedCount}</strong> / {SIGN_WORDS.length} 张
              </span>
            </div>
            {uploadedCount < SIGN_WORDS.length && (
              <span className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {SIGN_WORDS.length - uploadedCount} 张待上传
              </span>
            )}
          </div>

          {/* 批量上传按钮 */}
          <Button
            onClick={() => batchInputRef.current?.click()}
            variant="outline"
            className="w-full mt-2.5 h-10 rounded-[12px] text-[13px] text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            批量导入（文件名需与词条一致，如 你好.png）
          </Button>
          <input
            ref={batchInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleBatchUpload}
            className="hidden"
          />
        </div>

        {/* 词条列表 */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="space-y-1.5">
            {SIGN_WORDS.map((word) => {
              const hasImage = library[word] !== null && library[word] !== undefined;
              const isUploading = uploading === word;

              return (
                <div
                  key={word}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[14px] transition-colors ${
                    hasImage ? "bg-green-50/60" : "bg-gray-50"
                  }`}
                >
                  {/* 缩略图 */}
                  <div className="w-12 h-12 rounded-[10px] overflow-hidden flex-shrink-0 bg-white border border-gray-100 flex items-center justify-center">
                    {hasImage ? (
                      <img
                        src={library[word]!}
                        alt={word}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-gray-300" />
                    )}
                  </div>

                  {/* 词条名 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-medium text-gray-900">{word}</span>
                      {hasImage && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {hasImage ? "已设置" : "未上传"}
                    </span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleClickUpload(word)}
                      disabled={isUploading}
                      className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors ${
                        hasImage
                          ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          : "bg-blue-500 text-white hover:bg-blue-600"
                      }`}
                    >
                      {isUploading ? (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                      ) : hasImage ? (
                        "更换"
                      ) : (
                        <span className="flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          上传
                        </span>
                      )}
                    </button>
                    {hasImage && (
                      <button
                        onClick={() => handleRemove(word)}
                        className="h-8 w-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 隐藏的单个文件选择 input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}
