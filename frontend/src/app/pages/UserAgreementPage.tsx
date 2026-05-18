/**
 * 用户协议页面
 */

import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export default function UserAgreementPage() {
  const navigate = useNavigate();

  const sections = [
    {
      title: "1. 服务条款的接受",
      content: "欢迎使用手语助手应用（以下简称\"本应用\"）。本应用由手语助手团队开发和运营，致力于为听障人群提供便捷的辅助工具。使用本应用前，请您仔细阅读并理解本协议的全部内容。"
    },
    {
      title: "2. 服务说明",
      content: "本应用提供以下核心功能：",
      list: [
        "OCR文字识别：通过相机或相册图片识别文字内容",
        "手语交互：文字与手语的双向转换",
        "环境音感知：集成科大讯飞AI智能识别周围环境声音并提醒",
        "社区交流：为用户提供交流分享的平台"
      ]
    },
    {
      title: "3. 用户责任",
      content: "使用本应用时，您需要：",
      list: [
        "确保提供的信息真实、准确、完整",
        "妥善保管账号信息，对账号下的行为负责",
        "遵守国家法律法规和社会公德",
        "不得利用本应用从事违法违规活动",
        "尊重其他用户的合法权益"
      ]
    },
    {
      title: "4. 隐私保护",
      content: "我们高度重视用户隐私保护。本应用使用Supabase作为后端服务，数据传输采用HTTPS加密。我们承诺：",
      list: [
        "不会收集您的敏感个人信息",
        "不会向第三方出售或共享您的数据",
        "您可以随时删除本地保存的历史记录",
        "声音识别数据仅用于实时分析，不做存储"
      ]
    },
    {
      title: "5. 知识产权",
      content: "本应用的所有内容，包括但不限于软件、文字、图片、音频、视频、图表、界面设计、版面框架等，均受著作权法、商标法等法律法规保护。未经授权，不得复制、修改、传播本应用的任何内容。"
    },
    {
      title: "6. 免责声明",
      content: "以下情况造成的损失，本应用不承担责任：",
      list: [
        "因不可抗力导致的服务中断或故障",
        "因用户操作不当造成的数据丢失",
        "识别结果仅供参考，不保证100%准确",
        "第三方API（如科大讯飞）服务不可用导致的功能降级"
      ]
    },
    {
      title: "7. 协议修改",
      content: "我们有权根据需要修改本协议条款。修改后的协议将在应用内公布。如果您继续使用本应用，即视为接受修改后的协议。"
    },
    {
      title: "8. 联系我们",
      content: "如果您对本协议有任何疑问或建议，请通过应用内的\"帮助中心\"联系我们。"
    },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex items-center justify-center border-b border-black/5">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost" size="sm" onClick={() => navigate("/profile")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black">用户协议</h1>
        </div>
      </div>

      <div className="p-4 space-y-3 w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-[14px] p-4 shadow-sm">
          <h2 className="text-[17px] font-bold text-gray-900 mb-4">手语助手用户服务协议</h2>
          
          <div className="space-y-4 text-[14px] text-gray-700 leading-relaxed">
            {sections.map((section, idx) => (
              <section key={idx}>
                <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">{section.title}</h3>
                <p>{section.content}</p>
                {section.list && (
                  <ul className="list-disc list-inside space-y-1 ml-2 mt-1.5">
                    {section.list.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-[12px] text-gray-400 text-center">本协议最后更新日期：2026年3月29日</p>
            <p className="text-[12px] text-gray-400 text-center mt-1">© 2026 手语助手团队 · 关爱听障人群</p>
          </div>
        </div>
      </div>
    </div>
  );
}