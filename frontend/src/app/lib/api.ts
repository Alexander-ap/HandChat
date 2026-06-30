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

/** API 基础地址 */
const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1/api`;
const EDGE_SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-481f4acb`;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim() || (
  import.meta.env.DEV
    ? `http://localhost:54321/functions/v1/api` // 本地开发时指向本地 Supabase Edge Function
    : EDGE_FUNCTION_BASE
);
const EDGE_ONLY_BASE = (import.meta.env.VITE_EDGE_API_BASE_URL || "").trim() || EDGE_SERVER_BASE;

//#region debug-point A:api-request-flow
const __ENABLE_DEBUG_REPORT__ = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_TELEMETRY === "true";
const __DBG_URL__ = "http://127.0.0.1:7777/event";
async function __dbgReport__(payload: Record<string, any>) {
  if (!__ENABLE_DEBUG_REPORT__) return;
  try {
    await fetch(__DBG_URL__, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "web-smoke-check",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "frontend/src/app/lib/api.ts",
        msg: "[DEBUG] API request flow",
        ts: Date.now(),
        src: "frontend",
        ...payload,
      }),
    });
  } catch (_) {}
}

function readJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
    return JSON.parse(atob(base64));
  } catch (_) {
    return null;
  }
}

function getJwtExpiresInMs(token: string | null) {
  const payload = readJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 - Date.now() : null;
}

function __dbgJwtMeta__(token: string | null) {
  if (!token) return { hasToken: false };
  const json = readJwtPayload(token);
  if (!json) return { hasToken: true, jwt: "unparseable" };
  const expMs = typeof json.exp === "number" ? json.exp * 1000 : null;
  return {
    hasToken: true,
    sub: json.sub,
    exp: json.exp,
    expMs,
    expInMs: expMs ? expMs - Date.now() : null,
    aud: json.aud,
    iss: json.iss,
  };
}
//#endregion

// ============================================================
// 基础工具函数
// ============================================================

function normalizeAuthor(author: any, avatar?: string) {
  if (author && typeof author === "object") {
    return {
      name: author.name || author.nickname || "匿名用户",
      avatar: author.avatar || avatar || "",
      verified: Boolean(author.verified),
    };
  }

  return {
    name: typeof author === "string" && author.trim() ? author : "匿名用户",
    avatar: avatar || "",
    verified: false,
  };
}

function normalizePost(post: any) {
  if (!post || typeof post !== "object") return post;
  return {
    ...post,
    author: normalizeAuthor(post.author ?? post.authorName ?? post.authorId, post.avatar),
    images: Array.isArray(post.images) ? post.images : [],
    comments: Number(post.comments ?? post.commentCount ?? 0),
    shares: Number(post.shares ?? 0),
    likes: Number(post.likes ?? 0),
    isLiked: Boolean(post.isLiked),
    isBookmarked: Boolean(post.isBookmarked),
    timeAgo: post.timeAgo || "刚刚",
  };
}

function normalizeComment(comment: any) {
  if (!comment || typeof comment !== "object") return comment;
  return {
    ...comment,
    author: normalizeAuthor(comment.author ?? comment.authorName ?? comment.authorId, comment.avatar),
    likes: Number(comment.likes ?? 0),
    timeAgo: comment.timeAgo || "刚刚",
  };
}

let cachedAuthToken: string | null = null;
const API_TIMEOUT_MS = 12000;

async function parseResponseBody(response: Response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (isJson) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text ? { error: text } : null;
}

/** 供外部（如 Root.tsx）同步最新 token，避免 getSession 读取延迟 */
export function syncAuthToken(token: string | null) {
  cachedAuthToken = token;
  //#region debug-point follow-auth-after-login
  void __dbgReport__({
    evt: "syncAuthToken",
    tokenMeta: __dbgJwtMeta__(token),
  });
  //#endregion debug-point follow-auth-after-login
}

/**
 * 获取当前用户的认证 Token（多层容错）
 */
async function getAuthToken(): Promise<string | null> {
  if (cachedAuthToken) {
    const expiresInMs = getJwtExpiresInMs(cachedAuthToken);
    if (expiresInMs === null || expiresInMs > 60 * 1000) {
      return cachedAuthToken;
    }
  }

  try {
    // 第一步：从缓存获取 session
    const { data: { session } } = await supabase.auth.getSession();
    //#region debug-point follow-auth-after-login
    void __dbgReport__({
      evt: "getAuthToken.getSession",
      hasSession: Boolean(session),
      expiresAt: session?.expires_at ?? null,
      expiresInMs: session?.expires_at ? session.expires_at * 1000 - Date.now() : null,
      tokenMeta: __dbgJwtMeta__(session?.access_token ?? null),
    });
    //#endregion debug-point follow-auth-after-login
    
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
        //#region debug-point follow-auth-after-login
        void __dbgReport__({
          evt: "getAuthToken.refreshSession",
          hasSession: Boolean(refreshed),
          expiresAt: refreshed?.expires_at ?? null,
          expiresInMs: refreshed?.expires_at ? refreshed.expires_at * 1000 - Date.now() : null,
          tokenMeta: __dbgJwtMeta__(refreshed?.access_token ?? null),
        });
        //#endregion debug-point follow-auth-after-login
        if (refreshed?.access_token) {
          cachedAuthToken = refreshed.access_token;
          return refreshed.access_token;
        }
      } catch (e) {
        console.warn('[API] Token刷新失败，使用现有token');
        //#region debug-point follow-auth-after-login
        void __dbgReport__({
          evt: "getAuthToken.refreshSession.error",
          message: (e as any)?.message ?? String(e),
        });
        //#endregion debug-point follow-auth-after-login
      }
      return session.access_token;
    }

    return null;
  } catch (error) {
    console.warn('[API] 获取认证Token失败:', error);
    //#region debug-point follow-auth-after-login
    void __dbgReport__({
      evt: "getAuthToken.error",
      message: (error as any)?.message ?? String(error),
    });
    //#endregion debug-point follow-auth-after-login
    return null;
  }
}

export async function getCurrentAuthToken(): Promise<string | null> {
  return getAuthToken();
}

export async function getCurrentAuthUserId(): Promise<string | null> {
  const token = await getAuthToken();
  const payload = readJwtPayload(token);
  return typeof payload?.sub === "string" ? payload.sub : null;
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
  //#region debug-point A:api-call-begin
  void __dbgReport__({
    evt: "apiCall.begin",
    endpoint,
    requireAuth,
    apiBase: API_BASE,
    tokenMeta: __dbgJwtMeta__(token),
  });
  //#endregion
  
  // requireAuth=true 但无 token → 抛错
  if (requireAuth && !token) {
    // try one more time to recover session from local storage before throwing error
    const { data: { session } } = await supabase.auth.getSession();
    //#region debug-point A:api-call-no-token
    void __dbgReport__({
      evt: "apiCall.noToken.regetSession",
      endpoint,
      hasSession: Boolean(session),
      tokenMeta: __dbgJwtMeta__(session?.access_token ?? null),
    });
    //#endregion
    if (session?.access_token) {
      cachedAuthToken = session.access_token;
      token = session.access_token;
    } else {
      throw new Error('未登录或登录已过期，请重新登录');
    }
  }
  
  const getJwtAlg = (t: string | null) => {
    if (!t) return null;
    try {
      const base64Url = t.split(".")[0];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
      const header = JSON.parse(atob(base64));
      return header?.alg || null;
    } catch (_) {
      return null;
    }
  };

  const buildHeaders = (t: string | null): HeadersInit => {
    const alg = getJwtAlg(t);
    const useSupabaseEdgeWorkaround = Boolean(t) && alg === "ES256";
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    headers.set(
      "Authorization",
      useSupabaseEdgeWorkaround ? `Bearer ${publicAnonKey}` : t ? `Bearer ${t}` : `Bearer ${publicAnonKey}`
    );
    headers.set("apikey", publicAnonKey);
    if (useSupabaseEdgeWorkaround && t) {
      headers.set("x-user-jwt", t);
    }
    return headers;
  };

  let response: Response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: buildHeaders(token),
    });
    //#region debug-point A:api-call-response
    void __dbgReport__({
      evt: "apiCall.response",
      endpoint,
      requireAuth,
      status: response.status,
      ok: response.ok,
    });
    //#endregion
  } catch (networkError: any) {
    console.warn('[API] 网络请求失败:', endpoint, networkError);
    //#region debug-point A:api-call-network-error
    void __dbgReport__({
      evt: "apiCall.networkError",
      endpoint,
      apiBase: API_BASE,
      message: networkError?.message ?? String(networkError),
    });
    //#endregion
    if (networkError?.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw new Error(`网络连接失败，请检查网络后重试`);
  } finally {
    window.clearTimeout(timeoutId);
  }

  // ── 401 自动重试逻辑 ──
  if (response.status === 401) {
    //#region debug-point A:api-call-401
    let body: any = null;
    try {
      body = await response.clone().json();
    } catch (_) {}
    void __dbgReport__({
      evt: "apiCall.401",
      endpoint,
      requireAuth,
      body,
      apiBase: API_BASE,
      tokenMeta: __dbgJwtMeta__(token),
    });
    //#endregion
    // 尝试刷新 token 后重试一次
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed?.access_token) {
        token = refreshed.access_token;
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: buildHeaders(token),
        });
        //#region debug-point A:api-call-401-retry
        void __dbgReport__({
          evt: "apiCall.401.retryResponse",
          endpoint,
          status: retryResponse.status,
          tokenMeta: __dbgJwtMeta__(token),
        });
        //#endregion
        if (retryResponse.ok) {
          return parseResponseBody(retryResponse);
        }
      }
    } catch (e) {
      // 刷新失败
      //#region debug-point A:api-call-refresh-error
      void __dbgReport__({
        evt: "apiCall.401.refresh.error",
        endpoint,
        message: (e as any)?.message ?? String(e),
      });
      //#endregion
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
      cachedAuthToken = null;
      //#region debug-point A:api-call-401-final
      void __dbgReport__({
        evt: "apiCall.401.finalFail",
        endpoint,
      });
      //#endregion
      throw new Error('认证失败，请重新登录');
    }
    // 非必须认证 → 返回空结果而非抛错
    return {};
  }

  if (!response.ok) {
    const error = await parseResponseBody(response);
    throw new Error(error.error || `HTTP error ${response.status}`);
  }

  return parseResponseBody(response);
}

// ============================================================
// 用户资料 API
// ============================================================

/** 用户资料相关接口 */
export const userApi = {
  async getProfile() {
    return apiCall('/user/profile')
  },

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
      });
    } catch (e: any) {
      // 降级：直接通过 Supabase 客户端更新 user_metadata
      console.warn('[用户资料] API失败，降级到客户端直接更新:', e.message);
      const { error } = await supabase.auth.updateUser({
        data: {
          name: data.name,
          bio: data.bio,
          phone: data.phone,
          location: data.location,
          avatar_url: data.avatar_url,
        },
      });
      if (error) throw new Error(error.message);
      return { success: true };
    }
  },

  /** 获取用户统计数据 — 失败静默降级 */
  async getStats() {
    return apiCall('/user/stats');
  },

  async getSettings() {
    return apiCall('/user/settings')
  },

  async updateSettings(data: {
    notification?: boolean
    vibration?: boolean
    language?: string
  }) {
    return apiCall('/user/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async getDailyStats(days = 7) {
    const data = await apiCall(`/user/stats/daily?days=${days}`)
    return Array.isArray(data) ? data : []
  },

  async getBasic(userId: string) {
    return apiCall(`/user/${userId}/basic`, {}, false)
  },

  async getBookmarks(limit = 20, offset = 0) {
    return apiCall(`/user/bookmarks?limit=${limit}&offset=${offset}`)
  },

  async getMyPosts(limit = 50, offset = 0) {
    const response = await apiCall(`/user/posts?limit=${limit}&offset=${offset}`)
    if (Array.isArray(response?.posts)) {
      return { ...response, posts: response.posts.map(normalizePost) }
    }
    return { posts: [] }
  },

  async getMyComments(limit = 50, offset = 0) {
    return apiCall(`/user/comments?limit=${limit}&offset=${offset}`)
  },

  /** 获取积分明细列表 */
  async getPointsHistory() {
    try {
      return await apiCall('/points/history');
    } catch (e) {
      return { records: [] };
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
      });
    } catch (e) {
      // 积分记录失败不影响功能使用
      return { success: false };
    }
  },
};

// ============================================================
// 关注/粉丝 API
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

  async getFollowingStatus(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, 100)
    if (ids.length === 0) return { following: {} as Record<string, boolean> }
    return apiCall(`/user/following/status?ids=${encodeURIComponent(ids.join(','))}`)
  },

  async getFollowers(userId: string) {
    return apiCall(`/user/${userId}/followers`, {}, false)
  },

  async getFollowing(userId: string) {
    return apiCall(`/user/${userId}/following`, {}, false)
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
    const response = await apiCall('/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (response?.success && response?.post) {
      return { ...response, post: normalizePost(response.post) };
    }
    if (response?.id) {
      return { success: true, post: normalizePost(response) };
    }
    return response;
  },

  /** 获取帖子列表 */
  async getAll(feed?: 'following') {
    const query = feed ? `?feed=${feed}` : ''
    const response = await apiCall(`/posts${query}`, {}, feed === 'following')
    if (Array.isArray(response)) {
      return { posts: response.map(normalizePost) }
    }
    if (Array.isArray(response?.posts)) {
      return { ...response, posts: response.posts.map(normalizePost) }
    }
    return { posts: [] }
  },

  /** 获取单条帖子详情 */
  async getById(postId: string) {
    return apiCall(`/posts/${postId}`, {}, false)
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
    const response = await apiCall(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (response?.success && response?.comment) {
      return { ...response, comment: normalizeComment(response.comment) };
    }
    if (response?.id) {
      return { success: true, comment: normalizeComment(response) };
    }
    return response;
  },

  async deleteComment(postId: string, commentId: string) {
    return apiCall(`/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },

  /** 获取帖子评论列表 */
  async getComments(postId: string) {
    const response = await apiCall(`/posts/${postId}/comments`, {}, false);
    if (Array.isArray(response)) {
      return { comments: response.map(normalizeComment) };
    }
    if (Array.isArray(response?.comments)) {
      return { ...response, comments: response.comments.map(normalizeComment) };
    }
    return { comments: [] };
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

    const getJwtAlg = (t: string) => {
      try {
        const base64Url = t.split(".")[0];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
        const header = JSON.parse(atob(base64));
        return header?.alg || null;
      } catch (_) {
        return null;
      }
    };

    const doUpload = async (t: string) => {
      const alg = getJwtAlg(t);
      const useSupabaseEdgeWorkaround = alg === "ES256";
      return fetch(`${EDGE_ONLY_BASE}/upload`, {
        method: 'POST',
        headers: {
          ...(useSupabaseEdgeWorkaround
            ? { Authorization: `Bearer ${publicAnonKey}`, 'x-user-jwt': t }
            : { Authorization: `Bearer ${t}` }),
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
          const alg = getJwtAlg(session.access_token);
          const useSupabaseEdgeWorkaround = alg === "ES256";
          response = await fetch(`${EDGE_ONLY_BASE}/upload`, {
            method: 'POST',
            headers: {
              ...(useSupabaseEdgeWorkaround
                ? { Authorization: `Bearer ${publicAnonKey}`, 'x-user-jwt': session.access_token }
                : { Authorization: `Bearer ${session.access_token}` }),
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
    const response = await fetch(`${EDGE_ONLY_BASE}/signup`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        apikey: publicAnonKey,
      },
      body: JSON.stringify(data),
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(body?.error || `HTTP error ${response.status}`);
    }
    return body;
  },
};

// ============================================================
// 成就 API
// ============================================================

export const achievementsApi = {
  async getAll() {
    return apiCall('/achievements');
  },
};
