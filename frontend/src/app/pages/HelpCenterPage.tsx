import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";

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
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* iOS Style Header */}
      <div className="bg-white/80 backdrop-blur-md px-4 pt-14 pb-4 shadow-sm sticky top-0 z-50 flex items-center justify-center border-b border-gray-100">
        <div className="w-full max-w-2xl flex items-center justify-between relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black mx-auto">帮助中心</h1>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 w-full max-w-2xl mx-auto">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索帮助内容..."
            className="pl-9 h-9 rounded-[10px] bg-white border-none shadow-sm text-[14px]"
          />
        </div>

        {helpCategories.map((category, idx) => (
          <div key={idx} className="bg-white rounded-[14px] p-3.5 shadow-sm">
            <h2 className="text-[15px] font-bold text-gray-900 mb-1.5">{category.title}</h2>
            <Accordion type="single" collapsible className="space-y-0.5">
              {category.items.map((item, itemIdx) => (
                <AccordionItem key={itemIdx} value={`${idx}-${itemIdx}`} className="border-none">
                  <AccordionTrigger className="text-left text-[14px] font-medium text-gray-800 hover:text-blue-500 py-3">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[14px] text-gray-600 leading-relaxed pb-3">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}

        {/* 联系我们 */}
        <div className="bg-blue-50 rounded-[14px] p-5 text-center">
          <h3 className="text-[15px] font-bold text-gray-900 mb-2">还有其他问题？</h3>
          <p className="text-[14px] text-gray-600 mb-4">
            我们随时为您提供帮助
          </p>
          <Button className="bg-blue-500 hover:bg-blue-600 rounded-[12px] h-10 px-6 text-[14px]">
            联系客服
          </Button>
        </div>
      </div>
    </div>
  );
}