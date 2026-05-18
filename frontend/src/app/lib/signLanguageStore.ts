/**
 * 手语图库管理模块
 *
 * 功能:
 * - 维护手语词典（词语 → 图片 dataURL 映射）
 * - localStorage 持久化存储
 * - 最长匹配优先的中文分词算法
 */

/** 手语词典中支持的所有词条 */
export const SIGN_WORDS = [
  "帮助", "抱歉", "不是", "称赞", "等候",
  "麻烦", "你好", "请", "是", "谢谢", "再见",
] as const;

export type SignWord = typeof SIGN_WORDS[number];

/** 单条手语图片记录 */
export interface SignEntry {
  word: SignWord;
  imageDataUrl: string | null; // base64 data URL or null (未上传)
}

const STORAGE_KEY = "sign_language_library";

/**
 * 从 localStorage 加载全部手语图库
 */
export function loadSignLibrary(): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("[手语图库] 加载失败:", e);
  }
  // 初始化：所有词条都为 null
  const init: Record<string, string | null> = {};
  SIGN_WORDS.forEach(w => (init[w] = null));
  return init;
}

/**
 * 保存单个词条的图片到图库
 */
export function saveSignImage(word: string, dataUrl: string): void {
  const lib = loadSignLibrary();
  lib[word] = dataUrl;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

/**
 * 删除单个词条的图片
 */
export function removeSignImage(word: string): void {
  const lib = loadSignLibrary();
  lib[word] = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

/**
 * 获取已上传图片数量
 */
export function getUploadedCount(): number {
  const lib = loadSignLibrary();
  return Object.values(lib).filter(v => v !== null).length;
}

/** 分词结果 */
export interface TokenResult {
  word: string;
  matched: boolean;    // 是否匹配到词典中的词
  imageDataUrl: string | null;
}

/**
 * 最长匹配优先分词
 *
 * 将输入文字拆分为手语词典中的词语。
 * 算法: 从左到右扫描，每次尝试最长匹配（最多取前5个字符），
 * 如果匹配成功则消耗该词，否则将当前单字标记为未匹配并前进一步。
 *
 * 例: "你好谢谢再见" → ["你好", "谢谢", "再见"]
 * 例: "请帮助我" → ["请", "帮助", "我(未匹配)"]
 */
export function tokenizeText(text: string): TokenResult[] {
  const lib = loadSignLibrary();
  const wordSet = new Set<string>(SIGN_WORDS);
  const results: TokenResult[] = [];
  let i = 0;
  const cleanText = text.replace(/[\s,，。.!！?？、；;：:""''（）()【】\[\]{}…—\-\n\r\t]/g, "");

  while (i < cleanText.length) {
    let matched = false;
    // 尝试从最长(5字符)到最短(1字符)匹配
    const maxLen = Math.min(5, cleanText.length - i);
    for (let len = maxLen; len >= 1; len--) {
      const candidate = cleanText.substring(i, i + len);
      if (wordSet.has(candidate)) {
        results.push({
          word: candidate,
          matched: true,
          imageDataUrl: lib[candidate] || null,
        });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 单字未匹配，标记为未知
      results.push({
        word: cleanText[i],
        matched: false,
        imageDataUrl: null,
      });
      i++;
    }
  }
  return results;
}

/**
 * 将 File 对象读取为 base64 data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
