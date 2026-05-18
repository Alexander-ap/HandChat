import { useState } from "react";
import { Hand, Camera, Volume2, MessageCircle, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";

interface WelcomeScreenProps {
  onComplete: () => void;
}

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { text } = useLanguage();

  const slides = [
    {
      icon: Camera,
      title: text("视觉文字辅助", "Smart Vision Assistance"),
      description: text("通过相机快速识别文字，支持 OCR 智能识别和文字放大功能，让信息触手可及", "Use the camera to recognize text quickly, enlarge key content, and make information easier to access."),
      bgColor: "bg-blue-100",
      iconColor: "text-blue-500",
      accentColor: "from-blue-400 to-blue-600",
    },
    {
      icon: Hand,
      title: text("手语双向转换", "Two-Way Sign Translation"),
      description: text("实现手语动作到文字的实时转换，支持文字输入转手语图片展示，沟通无障碍", "Translate sign gestures into text in real time and convert text into sign illustrations for smoother communication."),
      bgColor: "bg-green-100",
      iconColor: "text-green-500",
      accentColor: "from-green-400 to-emerald-600",
    },
    {
      icon: Volume2,
      title: text("环境音感知", "Ambient Sound Alerts"),
      description: text("智能识别门铃、警报等环境声音，通过震动和视觉提醒及时通知您，安全有保障", "Detect doorbells, alarms, and other important sounds with vibration and visual alerts for safer awareness."),
      bgColor: "bg-purple-100",
      iconColor: "text-purple-500",
      accentColor: "from-purple-400 to-purple-600",
    },
    {
      icon: MessageCircle,
      title: text("专属社交社区", "Inclusive Community"),
      description: text("为听障群体打造的温暖交流平台，分享经验、互相帮助、共同成长", "A welcoming space for deaf and hard-of-hearing users to share experiences, support each other, and grow together."),
      bgColor: "bg-pink-100",
      iconColor: "text-pink-500",
      accentColor: "from-pink-400 to-rose-600",
    },
  ];

  const handleNext = () => {
    // 触觉反馈
    if (navigator.vibrate) navigator.vibrate(10);
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col">
      {/* Skip */}
      <div className="flex justify-end p-5 pt-14">
        <button
          onClick={onComplete}
          className="text-[14px] text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-full transition-colors"
        >
          {text("跳过", "Skip")}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <div className={`w-32 h-32 rounded-[36px] ${slide.bgColor} flex items-center justify-center mb-10 shadow-lg`}>
              <Icon className={`w-16 h-16 ${slide.iconColor}`} strokeWidth={1.5} />
            </div>

            <h2 className="text-[26px] font-bold text-gray-900 mb-3 text-center tracking-tight">
              {slide.title}
            </h2>
            <p className="text-[15px] text-gray-500 text-center leading-relaxed max-w-[280px]">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom */}
      <div className="px-8 pb-12 space-y-6">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, index) => (
            <motion.div
              key={index}
              animate={{
                width: index === currentSlide ? 24 : 8,
                backgroundColor: index === currentSlide ? "#3B82F6" : "#D1D5DB",
              }}
              transition={{ duration: 0.3 }}
              className="h-2 rounded-full"
            />
          ))}
        </div>

        {/* Button */}
        <Button
          onClick={handleNext}
          className="w-full h-[54px] bg-blue-500 hover:bg-blue-600 rounded-2xl text-[16px] font-semibold shadow-[0_4px_14px_0_rgb(59,130,246,0.39)] active:scale-[0.98] transition-all"
        >
          {currentSlide === slides.length - 1 ? (
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {text("立即开始", "Get Started")}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              {text("下一步", "Next")}
              <ChevronRight className="w-5 h-5" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
