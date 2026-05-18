import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Search, LifeBuoy } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { useLanguage } from "../contexts/LanguageContext";

const helpCategories = [
  {
    title: "快速入门",
    items: [
      { q: "如何使用OCR文字识别？", a: "点击首页的「拍照识别」或「相册选择」按钮，选择包含文字的图片，系统会自动识别并提取文字内容。" },
      { q: "如何使用手语翻译功能？", a: "进入手语交互页面，可以选择「文字转手语」或「手语转文字」。文字转手语：输入文字后点击转换。手语转文字：开启摄像头进行实时识别。" },
      { q: "如何使用环境音识别？", a: "进入环境音感知页面，点击「开始监听」按钮。系统会实时监听周围声音，检测到设定的声音类型时会通过震动和屏幕闪烁提醒。" },
    ]
  },
  {
    title: "功能说明",
    items: [
      { q: "支持哪些声音类型检测？", a: "目前支持门铃、警报、婴儿哭声、狗叫、电话铃声、敲门声等6种常见环境声音的检测。" },
      { q: "如何调整声音检测灵敏度？", a: "在环境音感知页面，可以通过滑动条调整识别灵敏度。灵敏度越高，越容易检测到声音，但也可能产生误报。" },
      { q: "识别历史保存在哪里？", a: "OCR识别结果会自动保存在首页的识别历史中，可以随时查看、复制或删除。" },
    ]
  },
  {
    title: "常见问题",
    items: [
      { q: "为什么无法访问摄像头？", a: "请检查浏览器权限设置，确保已授予应用访问摄像头的权限。如果使用的是HTTPS网站，浏览器才能访问摄像头。" },
      { q: "识别准确率如何提高？", a: "对于OCR：确保图片清晰、光线充足、文字完整。对于手语：保持手部在摄像头范围内，背景简洁，动作清晰。对于声音：在安静环境下使用，适当调整灵敏度。" },
      { q: "如何更换主题背景？", a: "进入「我的」页面，点击「背景主题」选项，可以选择多种预设主题，包括渐变色和纯色主题。" },
    ]
  },
  {
    title: "隐私与安全",
    items: [
      { q: "我的数据会被上传吗？", a: "应用采用本地处理方式，所有识别和转换过程都在您的设备上完成，不会上传任何个人数据。" },
      { q: "如何删除历史记录？", a: "在识别历史列表中，每条记录都有删除按钮，点击即可删除。您也可以在设置中清除所有历史记录。" },
      { q: "相机权限安全吗？", a: "相机权限仅用于手语识别和拍照识别功能，不会在后台录制或保存视频。使用完毕后会立即释放相机资源。" },
    ]
  }
];

export default function HelpCenterPage() {
  const navigate = useNavigate();
  const { text } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const visibleCategories = helpCategories
    .map((category) => ({
      ...category,
      items: category.items.filter(
        (item) =>
          !searchQuery.trim() ||
          item.q.includes(searchQuery.trim()) ||
          item.a.includes(searchQuery.trim())
      ),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <div className="app-topbar sticky top-0 z-50 flex items-center justify-center px-4 pt-10 pb-4">
        <div className="relative w-full max-w-2xl flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="absolute left-0 rounded-full px-0 text-[16px] font-medium text-blue-500 hover:bg-transparent hover:text-blue-600"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <div className="mx-auto text-center">
            <h1 className="text-[17px] font-semibold text-slate-900">帮助中心</h1>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto space-y-4 px-4 pt-3">
        <div className="app-panel-strong app-grid-glow rounded-[28px] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-blue-500/[0.08] text-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-blue-500">{text("指南与支持", "GUIDE & SUPPORT")}</p>
              <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-slate-900">快速查找常见功能与问题解答</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                覆盖 OCR、手语交互、环境音感知、隐私保护等高频问题，方便你直接检索。
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">功能主题</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">{helpCategories.length} 类</p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">常见问答</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">
                {helpCategories.reduce((total, category) => total + category.items.length, 0)} 条
              </p>
            </div>
            <div className="rounded-[18px] border border-white/70 bg-white/72 px-3 py-3">
              <p className="text-[11px] text-slate-400">支持方式</p>
              <p className="mt-1 text-[13px] font-medium text-slate-800">搜索与展开</p>
            </div>
          </div>
        </div>

        <div className="app-panel rounded-[24px] p-4">
          <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索帮助内容..."
            className="h-11 rounded-[14px] border-none bg-white/80 pl-9 text-[14px] shadow-none"
          />
          </div>
        </div>

        {visibleCategories.map((category, idx) => (
          <div key={idx} className="app-panel rounded-[24px] p-4">
            <h2 className="mb-2 text-[15px] font-bold text-slate-900">{category.title}</h2>
            <Accordion type="single" collapsible className="space-y-1">
              {category.items.map((item, itemIdx) => (
                <AccordionItem
                  key={itemIdx}
                  value={`${idx}-${itemIdx}`}
                  className="rounded-[18px] border border-white/70 bg-white/72 px-4"
                >
                  <AccordionTrigger className="py-3 text-left text-[14px] font-medium text-slate-800 hover:text-blue-500">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 text-[14px] leading-relaxed text-slate-600">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}

        {visibleCategories.length === 0 && (
          <div className="app-panel-strong rounded-[24px] p-5 text-center">
            <h3 className="text-[16px] font-semibold text-slate-900">没有找到匹配内容</h3>
            <p className="mt-2 text-[13px] leading-6 text-slate-500">
              换个关键词试试，或直接浏览下面的帮助主题。
            </p>
          </div>
        )}

        <div className="app-panel-strong app-grid-glow rounded-[28px] p-5 text-center">
          <h3 className="mb-2 text-[15px] font-bold text-slate-900">还有其他问题？</h3>
          <p className="mb-4 text-[14px] text-slate-600">
            我们随时为您提供帮助
          </p>
          <Button className="h-11 rounded-[14px] bg-blue-500 px-6 text-[14px] hover:bg-blue-600">
            联系客服
          </Button>
        </div>
      </div>
    </div>
  );
}
