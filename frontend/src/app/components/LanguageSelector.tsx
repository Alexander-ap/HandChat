import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useLanguage, type AppLanguage } from "../contexts/LanguageContext";

interface LanguageSelectorProps {
  open: boolean;
  onClose: () => void;
}

const languageOptions: Array<{ id: AppLanguage; zhLabel: string; enLabel: string; descriptionZh: string; descriptionEn: string }> = [
  {
    id: "zh",
    zhLabel: "中文",
    enLabel: "Chinese",
    descriptionZh: "完整中文界面",
    descriptionEn: "Full Chinese interface",
  },
  {
    id: "en",
    zhLabel: "英文",
    enLabel: "English",
    descriptionZh: "完整英文界面",
    descriptionEn: "Full English interface",
  },
];

export default function LanguageSelector({ open, onClose }: LanguageSelectorProps) {
  const { language, setLanguage, text } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm rounded-[20px] p-5">
        <DialogHeader>
          <DialogTitle className="text-center text-[17px] font-semibold">
            {text("选择语言", "Choose Language")}
          </DialogTitle>
          <DialogDescription className="text-center text-[13px] text-gray-500">
            {text("切换为完整的中文或英文界面", "Switch to the full Chinese or English interface")}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {languageOptions.map((option) => {
            const selected = option.id === language;
            return (
              <button
                key={option.id}
                onClick={() => {
                  setLanguage(option.id);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left transition-all ${
                  selected
                    ? "border-blue-500 bg-blue-50/80 shadow-[0_10px_24px_rgba(59,130,246,0.12)]"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <p className="text-[15px] font-medium text-slate-900">
                    {text(option.zhLabel, option.enLabel)}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {text(option.descriptionZh, option.descriptionEn)}
                  </p>
                </div>
                {selected && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
