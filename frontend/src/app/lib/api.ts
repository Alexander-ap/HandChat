/**
 * 无障碍助手 - 统一 API 工具库
 * 
 * 封装所有后端 API 调用，提供统一的错误处理和认证机制
 * 
 * @module api
 * @version 2.1.0
 */

import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase } from './supabase';

/** API 基础地址 — 开发用本地 Express，生产用 Supabase Edge Function */
const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:3001/api' : `https://${projectId}.supabase.co/functions/v1/make-server-481f4acb`);

// ============================================================
// 基础工具函数
// ============================================================

let cachedAuthToken: string | null = null;

/** 供外部（如 Root.tsx）同步最新 token，避免 getSession 读取延迟 */
export function syncAuthToken(token: string | null) {
  cachedAuthToken = token;
}

/**
 * 获取当前用户的认证 Token（多层容错）
 */
async function getAuthToken(): Promise<string | null> {
  if (cachedAuthToken) return cachedAuthToken;

  try {
    // 第一步：从缓存获取 session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      cachedAuthToken = session.access_token;
      // 这里的 expires_at 有时会导致不必要的刷新，为了稳定，如果差值>60秒就直接返回
      const expiresAt = session.expires_at;
      if (expiresAt && (expiresAt * 1000 - Date.now()) > 60 * 1000) {
        return session.access_token;
      }
      
      // 尝试刷新
      try {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed?.access_token) {
          cachedAuthToken = refreshed.access_token;
          return refreshed.access_token;
        }
      } catch (e) {
        console.warn('[API] Token刷新失败，使用现有token');
      }
      return session.access_token;
    }

    return null;
  } catch (error) {
    console.warn('[API] 获取认证Token失败:', error);
    return null;
  }
}

/**
 * 通用 API 请求函数
 * 
 * 认证策略:
 * - requireAuth=true:  必须带有效token，失败时自动尝试刷新token重试一次
 * - requireAuth=false: 优先带token(如果有)，没有则用 anon key，不会抛认证错误
 */
async function apiCall(endpoint: string, options: RequestInit = {}, requireAuth = true) {
  let token = await getAuthToken();
  
  // requireAuth=true 但无 token → 抛错
  if (requireAuth && !token) {
    // try one more time to recover session from local storage before throwing error
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
    } else {
      throw new Error('未登录或登录已过期，请重新登录');
    }
  }
  
  // 构建 headers — 有 token 就用 token，否则用 anon key
  const buildHeaders = (t: string | null): HeadersInit => ({
    'Content-Type': 'application/json',
    'Authorization': t ? `Bearer ${t}` : `Bearer ${publicAnonKey}`,
    'apikey': publicAnonKey,
    ...options.headers,
  });

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: buildHeaders(token),
    });
  } catch (networkError: any) {
    console.warn('[API] 网络请求失败:', endpoint, networkError);
    throw new Error(`网络连接失败，请检查网络后重试`);
  }

  // ── 401 自动重试逻辑 ──
  if (response.status === 401) {
    // 尝试刷新 token 后重试一次
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed?.access_token) {
        token = refreshed.access_token;
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: buildHeaders(token),
        });
        if (retryResponse.ok) {
          return retryResponse.json();
        }
      }
    } catch (e) {
      // 刷新失败
    }

    // requireAuth=false 时用 anon key 做最后尝试
    if (!requireAuth) {
      try {
        const anonResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: buildHeaders(null),
        });
        if (anonResponse.ok) return anonResponse.json();
      } catch (_) {}
    }

    // 所有重试都失败
    if (requireAuth) {
      throw new Error('认证失败，请重新登录');
    }
    // 非必须认证 → 返回空结果而非抛错
    return {};
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '网络错误' }));
    throw new Error(error.error || `HTTP error ${response.status}`);
  }

  return response.json();
}

// ============================================================
// 用户资料 API
// ============================================================

/** 用户资料相关接口 */
export const userApi = {
  /**
   * 更新用户资料
   * 失败时自动降级到 Supabase 客户端直接更新
   */
  async updateProfile(data: { 
    name?: string; 
    bio?: string; 
    phone?: string; 
    location?: string;
    avatar_url?: string;
  }) {
    try {
      return await apiCall('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    } catch (e: any) {
      console.warn('[用户资料] API失败，降级到客户端直接更新:', e.message)
      const { error } = await supabase.auth.updateUser({
        data: {
          name: data.name,
          bio: data.bio,
          phone: data.phone,
          location: data.location,
          avatar_url: data.avatar_url,
        },
      })
      if (error) throw new Error(error.message)
      return { success: true }
    }
  },

  /** 获取用户资料 */
  async getProfile() {
    return apiCall('/user/profile')
  },

  /** 获取用户设置 */
  async getSettings() {
    return apiCall('/user/settings')
  },

  /** 更新用户设置 */
  async updateSettings(data: { notification?: boolean; vibration?: boolean; language?: string }) {
    return apiCall('/user/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /** 获取用户统计数据 — 失败静默降级 */
  async getStats() {
    try {
      const result = await apiCall('/user/stats')
      return result
    } catch (e) {
      console.warn('[统计] 获取失败，使用默认值')
      return {
        stats: {
          days: 0,
          points: 0,
          achievements: 0,
          loginStreak: 1,
          totalTranslations: 0,
          totalOcr: 0,
          totalSoundDetections: 0,
          postCount: 0,
          followingCount: 0,
          followerCount: 0,
        }
      }
    }
  },

  /** 获取积分明细列表 */
  async getPointsHistory() {
    try {
      return await apiCall('/points/history')
    } catch (e) {
      return { records: [] }
    }
  },

  /**
   * 记录用户操作 (触发积分奖励) — 失败静默
   */
  async recordAction(action: 'ocr' | 'sign_language' | 'sound_detection' | 'post' | 'comment') {
    try {
      return await apiCall('/user/action', {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
    } catch (e) {
      return { success: false }
    }
  },
};

// ============================================================
// OCR 识别 API
// ============================================================

/** OCR 文字识别相关接口 */
export const ocrApi = {
  /** 保存 OCR 识别记录 */
  async saveRecord(data: { image: string; text: string }) {
    return apiCall('/ocr/history', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** 获取 OCR 识别历史列表 */
  async getHistory() {
    return apiCall('/ocr/history');
  },

  /** 删除指定 OCR 记录 */
  async deleteRecord(id: string) {
    return apiCall(`/ocr/history/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================
// 手语转换 API
// ============================================================

/** 手语转换相关接口 */
export const signLanguageApi = {
  /** 保存手语转换记录 */
  async saveRecord(data: { text?: string; result?: string; type: 'text-to-sign' | 'sign-to-text' }) {
    return apiCall('/sign-language/history', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** 获取手语转换历史列表 */
  async getHistory() {
    return apiCall('/sign-language/history');
  },
};

// ============================================================
// 声音识别 API
// ============================================================

/** 环境声音识别相关接口 */
export const soundApi = {
  /**
   * 调用科大讯飞声音识别 API — 失败时静默降级
   */
  async recognize(data: { audio: string; format?: string; sampleRate?: number }) {
    try {
      return await apiCall('/sound/recognize', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.warn('[声音识别] API调用失败，使用本地降级');
      return { success: false, result: null, mode: 'local' };
    }
  },

  /** 保存声音检测记录 — 失败静默 */
  async saveRecord(data: { soundType: string; confidence: number; description: string }) {
    try {
      return await apiCall('/sound/history', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      return { success: false };
    }
  },

  /** 获取声音检测历史列表 */
  async getHistory() {
    try {
      return await apiCall('/sound/history');
    } catch (e) {
      return { history: [] };
    }
  },
};

// ============================================================
// 社区帖子 API
// ============================================================

/** 社区帖子相关接口 */
export const postsApi = {
  /**
   * 发布新帖子 — 优先带token，没有也允许发布
   */
  async create(data: { 
    content: string; 
    author?: string; 
    avatar?: string; 
    images?: string[] 
  }) {
    return apiCall('/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  /** 获取所有帖子列表 */
  async getAll() {
    return apiCall('/posts', {}, false);
  },

  /** 删除帖子 */
  async delete(postId: string) {
    return apiCall(`/posts/${postId}`, {
      method: 'DELETE',
    });
  },

  /** 点赞/取消点赞 — 使用 apiCall 内置的 401 自动刷新重试 */
  async like(postId: string) {
    return apiCall(`/posts/${postId}/like`, {
      method: 'POST',
    });
  },

  /** 收藏/取消收藏 */
  async bookmark(postId: string) {
    return apiCall(`/posts/${postId}/bookmark`, {
      method: 'POST',
    });
  },

  /**
   * 添加评论
   */
  async addComment(postId: string, content: string) {
    return apiCall(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  /** 获取帖子评论列表 */
  async getComments(postId: string) {
    return apiCall(`/posts/${postId}/comments`, {}, false);
  },
};

// ============================================================
// 文件上传 API
// ============================================================

/** 文件上传相关接口 */
export const uploadApi = {
  /**
   * 上传图片文件 — 401 时自动刷新 token 重试
   */
  async uploadImage(file: File) {
    let token = await getAuthToken();
    if (!token) {
      throw new Error('未登录或登录已过期，请重新登录');
    }
    
    const formData = new FormData();
    formData.append('file', file);

    const doUpload = async (t: string) => {
      return fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${t}`,
          'apikey': publicAnonKey,
        },
        body: formData,
      });
    };

    let response: Response;
    try {
      response = await doUpload(token);
    } catch (networkError) {
      throw new Error('网络连接失败，请检查网络后重试');
    }

    // 401 自动刷新重试
    if (response.status === 401) {
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          const formData2 = new FormData();
          formData2.append('file', file);
          response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': publicAnonKey,
            },
            body: formData2,
          });
        }
      } catch (_) {}
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('认证失败，请重新登录');
      }
      const error = await response.json().catch(() => ({ error: '上传失败' }));
      throw new Error(error.error || '上传失败');
    }

    return response.json();
  },
};

// ============================================================
// 用户注册 API
// ============================================================

/** 用户注册接口 (通过后端 Admin API 自动确认) */
export const authApi = {
  async signup(data: { email: string; password: string; name: string }) {
    return apiCall('/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }, false)
  },
}

// ============================================================
// 成就 API
// ============================================================

export const achievementsApi = {
  async getAll() {
    return apiCall('/achievements')
  },
}

// ============================================================
// 关注 API
// ============================================================

export const followApi = {
  async getFollowerCount(userId: string) {
    return apiCall(`/user/${userId}/followers/count`, {}, false)
  },

  async getFollowingCount(userId: string) {
    return apiCall(`/user/${userId}/following/count`, {}, false)
  },

  async follow(userId: string) {
    return apiCall(`/user/${userId}/follow`, { method: 'POST' })
  },

  async unfollow(userId: string) {
    return apiCall(`/user/${userId}/follow`, { method: 'DELETE' })
  },

  async isFollowing(userId: string) {
    return apiCall(`/user/${userId}/is-following`)
  },
}
