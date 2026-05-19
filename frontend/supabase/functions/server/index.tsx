/**
 * 无障碍助手 - 后端服务 (Hono + Supabase Edge Functions)
 * 
 * 功能模块:
 * 1. 用户认证 (注册/登录)
 * 2. 用户资料管理 (头像、个人信息)
 * 3. OCR历史记录 CRUD
 * 4. 手语转换历史记录
 * 5. 环境音检测历史记录 + 科大讯飞声音识别API代理
 * 6. 社区帖子 CRUD + 评论系统 + 点赞/收藏
 * 7. 文件上传 (Supabase Storage)
 * 8. 用户统计与积分系统
 * 
 * @author 无障碍助手团队
 * @version 2.0.0
 * @date 2026-03-29
 */

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

// ============================================================
// 应用初始化
// ============================================================

const app = new Hono();

// 全局错误处理: 确保即使发生未捕获异常也返回CORS头
app.onError((err, c) => {
  console.error('[全局错误]', err.message, err.stack);
  c.header('Access-Control-Allow-Origin', '*');
  return c.json({ error: err.message || '服务器内部错误' }, 500);
});

// 启用请求日志
app.use('*', logger(console.log));

// 启用 CORS 跨域支持
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-user-jwt", "x-client-info", "apikey", "X-Requested-With"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: false,
  }),
);

// 显式处理 OPTIONS 请求，防止跨域预检失败
app.options('*', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-jwt, x-client-info, apikey, X-Requested-With');
  c.header('Access-Control-Max-Age', '86400');
  return c.text('', 204);
});

/** Supabase Storage 存储桶名称 */
const BUCKET_NAME = "make-481f4acb-assets";

// ============================================================
// 工具函数
// ============================================================

/**
 * 安全的 KV 操作封装
 * 当 KV 表不可用时（如表未创建），优雅降级而非崩溃
 */
const safeKv = {
  async set(key: string, value: string): Promise<boolean> {
    try {
      await kv.set(key, value);
      return true;
    } catch (error) {
      const message = `[KV] set 失败 (key=${key}): ${(error as any).message}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 是否已创建，且 Edge Function 已配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。`);
    }
  },
  async get(key: string): Promise<any> {
    try {
      return await kv.get(key);
    } catch (error) {
      const message = `[KV] get 失败 (key=${key}): ${(error as any).message}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
  async del(key: string): Promise<boolean> {
    try {
      await kv.del(key);
      return true;
    } catch (error) {
      const message = `[KV] del 失败 (key=${key}): ${(error as any).message}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
  async getByPrefix(prefix: string): Promise<any[]> {
    try {
      return await kv.getByPrefix(prefix);
    } catch (error) {
      const message = `[KV] getByPrefix 失败 (prefix=${prefix}): ${(error as any).message}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
};

/**
 * 创建 Supabase 服务端客户端 (使用 Service Role Key)
 * @returns Supabase 客户端实例
 */
const getSupabase = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  return createClient(supabaseUrl, supabaseKey);
};

const getSupabaseAuthClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(supabaseUrl, supabaseKey);
};

const getBearerToken = (headerValue?: string | null) => {
  if (!headerValue) return "";
  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return "";
  return token?.trim() || "";
};

/**
 * 从请求头中提取并验证用户身份
 * @param c - Hono 上下文对象
 * @returns 验证通过的用户对象，失败则返回 null
 */
const authenticateUser = async (c: any) => {
  const accessToken =
    c.req.header('x-user-jwt') ||
    getBearerToken(c.req.header('Authorization')) ||
    getBearerToken(c.req.header('authorization'));
  if (!accessToken) return null;
  
  const supabase = getSupabaseAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
};

/**
 * 格式化时间为中文相对时间
 * @param timestamp - Unix 时间戳 (毫秒)
 * @returns 格式化的相对时间字符串
 */
const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
};

const DEFAULT_USER_SETTINGS = {
  notification: true,
  vibration: true,
  language: "zh-CN",
};

const parseStoredValue = (value: any) => {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
};

const buildUserProfilePayload = (user: any, cachedProfile?: any) => ({
  nickname: cachedProfile?.nickname ?? user?.user_metadata?.name ?? null,
  avatar: cachedProfile?.avatar ?? user?.user_metadata?.avatar_url ?? null,
  bio: cachedProfile?.bio ?? user?.user_metadata?.bio ?? null,
});

const getStoredUserSettings = async (userId: string) => {
  const settings = parseStoredValue(await safeKv.get(`user_settings_${userId}`));
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(settings || {}),
  };
};

const getUserBasicProfile = async (userId: string) => {
  const cachedProfile = parseStoredValue(await safeKv.get(`user_profile_${userId}`));
  if (cachedProfile) {
    return {
      userId,
      nickname: cachedProfile.nickname ?? null,
      avatar: cachedProfile.avatar ?? null,
      bio: cachedProfile.bio ?? null,
    };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return { userId, nickname: null, avatar: null, bio: null };
    }

    const profile = buildUserProfilePayload(data.user);
    await safeKv.set(`user_profile_${userId}`, JSON.stringify({
      userId,
      ...profile,
      updatedAt: Date.now(),
    }));

    return { userId, ...profile };
  } catch (_error) {
    return { userId, nickname: null, avatar: null, bio: null };
  }
};

const getFollowEntries = async () => {
  const values = await safeKv.getByPrefix("follow_");
  return values
    .map(parseStoredValue)
    .filter((item: any) => item?.followerId && item?.followingId);
};

// ============================================================
// 存储桶初始化
// ============================================================

/**
 * 初始化 Supabase Storage 存储桶
 * 如果存储桶不存在则自创建
 */
const initBucket = async () => {
  try {
    const supabase = getSupabase();
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket: any) => bucket.name === BUCKET_NAME);
    if (!bucketExists) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
      console.log(`[初始化] 存储桶已创建: ${BUCKET_NAME}`);
    }
  } catch (error) {
    console.error("[初始化] 存储桶创建失败:", error);
  }
};
initBucket();

// ============================================================
// 1. 健康检查
// ============================================================

/** 健康检查端点 - 用于监控服务状态 */
app.get("/make-server-481f4acb/health", (c) => {
  return c.json({ 
    status: "ok", 
    version: "2.0.0",
    timestamp: Date.now(),
    service: "无障碍助手后端服务"
  });
});

// ============================================================
// 2. 用户认证模块
// ============================================================

/**
 * 用户注册接口
 * POST /signup
 * 
 * @body {string} email - 用户邮箱
 * @body {string} password - 用户密码 (至少6位)
 * @body {string} [name] - 用户昵称
 * 
 * 使用 Admin API 创建用户并自动确认邮箱 (无需邮件验证)
 * 注册成功后自动初始化用户统计数据
 */
app.post("/make-server-481f4acb/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "请提供邮箱和密码" }, 400);
    }
    
    const supabase = getSupabase();
    
    // 使用 Admin API 创建用户并自动确认邮箱
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      user_metadata: { name: name || '新用户' },
      email_confirm: true
    });
    
    if (error) {
      console.error("[注册] 错误:", error);
      // 友好的错误提示
      if (error.code === 'email_exists' || (error.message && error.message.includes('already been registered'))) {
        return c.json({ error: "该邮箱已注册，请直接登录或使用其他邮箱" }, 409);
      }
      const status = error.status || 500;
      return c.json({ error: error.message }, status >= 400 && status < 600 ? status : 500);
    }
    
    // 初始化用户统计数据
    if (data.user) {
      const initialStats = {
        userId: data.user.id,
        days: 1,
        points: 100, // 注册赠送100积分
        achievements: 1, // 初始成就: 注册完成
        totalTranslations: 0,
        totalOcr: 0,
        totalSoundDetections: 0,
        loginStreak: 1,
        lastLoginDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now()
      };
      await safeKv.set(`user_stats_${data.user.id}`, JSON.stringify(initialStats));
      await safeKv.set(`user_profile_${data.user.id}`, JSON.stringify({
        userId: data.user.id,
        nickname: name || "新用户",
        avatar: null,
        bio: null,
        updatedAt: Date.now(),
      }));
      await safeKv.set(`user_settings_${data.user.id}`, JSON.stringify(DEFAULT_USER_SETTINGS));
      
      // 记录积分历史
      const pointRecord = {
        id: `${data.user.id}_${Date.now()}`,
        userId: data.user.id,
        title: "注册奖励",
        points: 100,
        type: "earn",
        date: new Date().toLocaleString('zh-CN'),
        createdAt: Date.now()
      };
      await safeKv.set(`points_${pointRecord.id}`, JSON.stringify(pointRecord));
    }
    
    return c.json({ success: true, user: data.user });
  } catch (error: any) {
    console.error("[注册] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 3. 文件上传模块
// ============================================================

/**
 * 图片上传接口
 * POST /upload
 * 
 * @body {File} file - 上传的图片文件
 * @header Authorization - Bearer Token
 * 
 * 上传图片到 Supabase Storage 并返回公开访问 URL
 */
app.post("/make-server-481f4acb/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "请选择要上传的文件" }, 400);
    }
    
    const supabase = getSupabase();
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `images/${fileName}`;
    
    // 上传文件到 Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });
      
    if (uploadError) {
      console.error("[上传] 错误:", uploadError);
      return c.json({ error: uploadError.message }, 500);
    }
    
    // 获取公开 URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);
    
    if (publicUrlData?.publicUrl) {
      return c.json({ url: publicUrlData.publicUrl });
    }
    
    // 退而求其次使用签名 URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      
    if (signedUrlError) {
      console.error("[上传] 签名URL错误:", signedUrlError);
      return c.json({ error: signedUrlError.message }, 500);
    }
    
    return c.json({ url: signedUrlData.signedUrl });
  } catch (error: any) {
    console.error("[上传] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 4. 用户资料模块
// ============================================================

/**
 * 获取用户资料
 * GET /user/profile
 */
app.get("/make-server-481f4acb/user/profile", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const cachedProfile = parseStoredValue(await safeKv.get(`user_profile_${user.id}`));
    return c.json(buildUserProfilePayload(user, cachedProfile));
  } catch (error: any) {
    console.error("[资料获取] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 更新用户资料
 * PUT /user/profile
 * 
 * @body {string} [name] - 昵称
 * @body {string} [bio] - 个人简介
 * @body {string} [phone] - 手机号
 * @body {string} [location] - 所在城市
 * @body {string} [avatar_url] - 头像URL
 */
app.put("/make-server-481f4acb/user/profile", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const supabase = getSupabase();
    const body = await c.req.json();
    const { name, nickname, bio, phone, location, avatar_url, avatar } = body;
    const effectiveName = nickname ?? name;
    const effectiveAvatar = avatar ?? avatar_url;
    
    // 构建更新数据，只更新有值的字段
    const updateData: Record<string, any> = {};
    if (effectiveName !== undefined) updateData.name = effectiveName;
    if (bio !== undefined) updateData.bio = bio;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (effectiveAvatar !== undefined) updateData.avatar_url = effectiveAvatar;
    
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { user_metadata: { ...user.user_metadata, ...updateData } }
    );
    
    if (error) {
      console.error("[资料更新] 错误:", error);
      return c.json({ error: error.message }, 500);
    }

    await safeKv.set(`user_profile_${user.id}`, JSON.stringify({
      userId: user.id,
      nickname: effectiveName ?? user.user_metadata?.name ?? null,
      avatar: effectiveAvatar ?? user.user_metadata?.avatar_url ?? null,
      bio: bio ?? user.user_metadata?.bio ?? null,
      updatedAt: Date.now(),
    }));
    
    return c.json({
      nickname: effectiveName ?? data.user?.user_metadata?.name ?? null,
      avatar: effectiveAvatar ?? data.user?.user_metadata?.avatar_url ?? null,
      bio: bio ?? data.user?.user_metadata?.bio ?? null,
    });
  } catch (error: any) {
    console.error("[资料更新] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取用户统计数据
 * GET /user/stats
 * 
 * 返回用户的使用天数、积分、成就等统计信息
 * 每次请求自动更新登录天数和连续打卡
 */
app.get("/make-server-481f4acb/user/stats", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const statsKey = `user_stats_${user.id}`;
    const statsStr = await safeKv.get(statsKey);
    let stats = statsStr ? (typeof statsStr === 'string' ? JSON.parse(statsStr) : statsStr) : {
      userId: user.id,
      days: 1,
      points: 100,
      achievements: 1,
      totalTranslations: 0,
      totalOcr: 0,
      totalSoundDetections: 0,
      loginStreak: 1,
      lastLoginDate: new Date().toISOString().split('T')[0],
      createdAt: Date.now()
    };
    
    // 自动更新登录天数
    const today = new Date().toISOString().split('T')[0];
    if (stats.lastLoginDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      stats.days = (stats.days || 0) + 1;
      stats.loginStreak = (stats.lastLoginDate === yesterday) 
        ? (stats.loginStreak || 0) + 1 
        : 1;
      stats.lastLoginDate = today;
      
      // 每日登录奖励10积分
      stats.points = (stats.points || 0) + 10;
      
      // 记录积分
      const pointRecord = {
        id: `${user.id}_${Date.now()}`,
        userId: user.id,
        title: "每日登录",
        points: 10,
        type: "earn",
        date: new Date().toLocaleString('zh-CN'),
        createdAt: Date.now()
      };
      await safeKv.set(`points_${pointRecord.id}`, JSON.stringify(pointRecord));
      
      // 连续登录成就检查
      if (stats.loginStreak >= 7 && stats.achievements < 3) {
        stats.achievements = 3;
      } else if (stats.loginStreak >= 3 && stats.achievements < 2) {
        stats.achievements = 2;
      }
      
      await safeKv.set(statsKey, JSON.stringify(stats));
    }
    
    return c.json({ stats });
  } catch (error: any) {
    console.error("[用户统计] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取用户设置
 * GET /user/settings
 */
app.get("/make-server-481f4acb/user/settings", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    return c.json(await getStoredUserSettings(user.id));
  } catch (error: any) {
    console.error("[用户设置] 获取异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 更新用户设置
 * PUT /user/settings
 */
app.put("/make-server-481f4acb/user/settings", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const body = await c.req.json();
    const current = await getStoredUserSettings(user.id);
    const nextSettings = {
      ...current,
      ...(body.notification !== undefined ? { notification: Boolean(body.notification) } : {}),
      ...(body.vibration !== undefined ? { vibration: Boolean(body.vibration) } : {}),
      ...(body.language !== undefined ? { language: String(body.language) } : {}),
    };

    await safeKv.set(`user_settings_${user.id}`, JSON.stringify(nextSettings));
    return c.json(nextSettings);
  } catch (error: any) {
    console.error("[用户设置] 更新异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取每日统计
 * GET /user/stats/daily?days=7
 */
app.get("/make-server-481f4acb/user/stats/daily", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const days = Math.min(Math.max(Number(c.req.query("days")) || 7, 1), 30);
    const [signRecords, ocrRecords, soundRecords, posts] = await Promise.all([
      safeKv.getByPrefix("sign_"),
      safeKv.getByPrefix("ocr_"),
      safeKv.getByPrefix("sound_"),
      safeKv.getByPrefix("post_"),
    ]);

    const counters: Record<string, number> = {};
    const collect = (values: any[], predicate: (item: any) => boolean) => {
      values
        .map(parseStoredValue)
        .filter((item: any) => item?.createdAt && predicate(item))
        .forEach((item: any) => {
          const date = new Date(item.createdAt).toISOString().slice(0, 10);
          counters[date] = (counters[date] || 0) + 1;
        });
    };

    collect(signRecords, (item) => item.userId === user.id);
    collect(ocrRecords, (item) => item.userId === user.id);
    collect(soundRecords, (item) => item.userId === user.id);
    collect(posts, (item) => item.userId === user.id);

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      result.push({
        date,
        count: counters[date] || 0,
      });
    }

    return c.json(result);
  } catch (error: any) {
    console.error("[每日统计] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取用户基础信息
 * GET /user/:id/basic
 */
app.get("/make-server-481f4acb/user/:id/basic", async (c) => {
  try {
    const userId = c.req.param("id");
    return c.json(await getUserBasicProfile(userId));
  } catch (error: any) {
    console.error("[用户基础信息] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取粉丝数
 * GET /user/:id/followers/count
 */
app.get("/make-server-481f4acb/user/:id/followers/count", async (c) => {
  try {
    const userId = c.req.param("id");
    const follows = await getFollowEntries();
    return c.json({ count: follows.filter((item: any) => item.followingId === userId).length });
  } catch (error: any) {
    console.error("[粉丝数] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取关注数
 * GET /user/:id/following/count
 */
app.get("/make-server-481f4acb/user/:id/following/count", async (c) => {
  try {
    const userId = c.req.param("id");
    const follows = await getFollowEntries();
    return c.json({ count: follows.filter((item: any) => item.followerId === userId).length });
  } catch (error: any) {
    console.error("[关注数] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取粉丝列表
 * GET /user/:id/followers
 */
app.get("/make-server-481f4acb/user/:id/followers", async (c) => {
  try {
    const userId = c.req.param("id");
    const follows = await getFollowEntries();
    return c.json({
      users: follows
        .filter((item: any) => item.followingId === userId)
        .map((item: any) => ({ userId: item.followerId })),
    });
  } catch (error: any) {
    console.error("[粉丝列表] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取关注列表
 * GET /user/:id/following
 */
app.get("/make-server-481f4acb/user/:id/following", async (c) => {
  try {
    const userId = c.req.param("id");
    const follows = await getFollowEntries();
    return c.json({
      users: follows
        .filter((item: any) => item.followerId === userId)
        .map((item: any) => ({ userId: item.followingId })),
    });
  } catch (error: any) {
    console.error("[关注列表] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 关注状态
 * GET /user/:id/is-following
 */
app.get("/make-server-481f4acb/user/:id/is-following", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ following: false });

    const targetUserId = c.req.param("id");
    const exists = await safeKv.get(`follow_${user.id}_${targetUserId}`);
    return c.json({ following: Boolean(exists) });
  } catch (error: any) {
    console.error("[关注状态] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 关注用户
 * POST /user/:id/follow
 */
app.post("/make-server-481f4acb/user/:id/follow", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const targetUserId = c.req.param("id");
    if (targetUserId === user.id) {
      return c.json({ error: "不能关注自己" }, 400);
    }

    await safeKv.set(`follow_${user.id}_${targetUserId}`, JSON.stringify({
      followerId: user.id,
      followingId: targetUserId,
      createdAt: Date.now(),
    }));
    return c.json({ success: true, following: true });
  } catch (error: any) {
    console.error("[关注] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 取消关注
 * DELETE /user/:id/follow
 */
app.delete("/make-server-481f4acb/user/:id/follow", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const targetUserId = c.req.param("id");
    await safeKv.del(`follow_${user.id}_${targetUserId}`);
    return c.json({ success: true, following: false });
  } catch (error: any) {
    console.error("[取消关注] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取积分明细
 * GET /user/points
 */
app.get("/make-server-481f4acb/user/points", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const records = await safeKv.getByPrefix(`points_${user.id}_`);
    const points = records
      .map((val: any) => typeof val === 'string' ? JSON.parse(val) : val)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return c.json({ records: points });
  } catch (error: any) {
    console.error("[积分明细] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 记录功能使用 (增加积分)
 * POST /user/action
 * @body {string} action - 操作类型 (ocr, sign_language, sound_detection, post, comment)
 */
app.post("/make-server-481f4acb/user/action", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const { action } = await c.req.json();
    const statsKey = `user_stats_${user.id}`;
    const statsStr = await safeKv.get(statsKey);
    let stats = statsStr ? (typeof statsStr === 'string' ? JSON.parse(statsStr) : statsStr) : {
      points: 100, totalTranslations: 0, totalOcr: 0, totalSoundDetections: 0, achievements: 1
    };
    
    // 根据操作类型分配积分
    const pointsMap: Record<string, { points: number; title: string; field?: string }> = {
      ocr: { points: 5, title: "使用文字识别", field: "totalOcr" },
      sign_language: { points: 5, title: "使用手语转换", field: "totalTranslations" },
      sound_detection: { points: 3, title: "使用声音识别", field: "totalSoundDetections" },
      post: { points: 20, title: "发布社区帖子" },
      comment: { points: 10, title: "发表评论" },
    };
    
    const reward = pointsMap[action];
    if (!reward) return c.json({ error: "未知操作类型" }, 400);
    
    stats.points = (stats.points || 0) + reward.points;
    if (reward.field) {
      stats[reward.field] = (stats[reward.field] || 0) + 1;
    }
    
    await safeKv.set(statsKey, JSON.stringify(stats));
    
    // 记录积分历史
    const pointRecord = {
      id: `${user.id}_${Date.now()}`,
      userId: user.id,
      title: reward.title,
      points: reward.points,
      type: "earn",
      date: new Date().toLocaleString('zh-CN'),
      createdAt: Date.now()
    };
    await safeKv.set(`points_${pointRecord.id}`, JSON.stringify(pointRecord));
    
    return c.json({ success: true, pointsEarned: reward.points, totalPoints: stats.points });
  } catch (error: any) {
    console.error("[用户操作] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 5. OCR 历史记录模块
// ============================================================

/** 保存 OCR 识别记录 */
app.post("/make-server-481f4acb/ocr/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const body = await c.req.json();
    const recordId = `${user.id}_${Date.now()}`;
    const record = {
      id: recordId,
      userId: user.id,
      ...body,
      createdAt: Date.now()
    };
    
    await safeKv.set(`ocr_${recordId}`, JSON.stringify(record));
    return c.json({ success: true, record });
  } catch (error: any) {
    console.error("[OCR保存] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 获取 OCR 识别历史 */
app.get("/make-server-481f4acb/ocr/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const keys = await safeKv.getByPrefix("ocr_");
    const records = keys
      .map((val: any) => typeof val === 'string' ? JSON.parse(val) : val)
      .filter((record: any) => record.userId === user.id)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return c.json({ records });
  } catch (error: any) {
    console.error("[OCR历史] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 删除 OCR 识别记录 */
app.delete("/make-server-481f4acb/ocr/history/:id", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const id = c.req.param('id');
    await safeKv.del(`ocr_${id}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("[OCR删除] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 6. 手语转换历史模块
// ============================================================

/** 保存手语转换记录 */
app.post("/make-server-481f4acb/sign-language/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const body = await c.req.json();
    const recordId = `${user.id}_${Date.now()}`;
    const record = {
      id: recordId,
      userId: user.id,
      ...body,
      createdAt: Date.now()
    };
    
    await safeKv.set(`sign_${recordId}`, JSON.stringify(record));
    return c.json({ success: true, record });
  } catch (error: any) {
    console.error("[手语保存] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 获取手语转换历史 */
app.get("/make-server-481f4acb/sign-language/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const keys = await safeKv.getByPrefix("sign_");
    const records = keys
      .map((val: any) => typeof val === 'string' ? JSON.parse(val) : val)
      .filter((record: any) => record.userId === user.id)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return c.json({ records });
  } catch (error: any) {
    console.error("[手语历史] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 7. 环境音检测模块 + 科大讯飞声音识别API
// ============================================================

/**
 * 科大讯飞 环境声音识别 API 代理
 * POST /sound/recognize
 * 
 * @body {string} audio - Base64编码的音频数据
 * @body {string} [format] - 音频格式 (默认 "wav")
 * @body {number} [sampleRate] - 采样率 (默认 16000)
 * 
 * 科大讯飞 API 购买指南:
 * ================================================
 * 1. 访问 https://www.xfyun.cn/ 注册账号
 * 2. 进入控制台 -> 创建应用
 * 3. 在应用中开通「声音事件检测」或「环境声音分类」服务
 *    - 路径: 控制台 -> 我的应用 -> 添加服务 -> 声音事件检测
 *    - 官方文档: https://www.xfyun.cn/doc/asr/sound-event/API.html
 * 4. 获取三个关键参数:
 *    - APPID: 应用ID
 *    - API Key: 接口密钥
 *    - API Secret: 接口密钥对
 * 5. 定价参考:
 *    - 免费额度: 新注册用户可获得一定免费调用次数
 *    - 付费套餐: 约 0.01-0.03 元/次 (按量计费)
 *    - 企业套餐: 可联系商务获取批量优惠
 * 6. 将获取的密钥配置到 Supabase Secrets:
 *    - XFYUN_APP_ID
 *    - XFYUN_API_KEY
 *    - XFYUN_API_SECRET
 * ================================================
 */
app.post("/make-server-481f4acb/sound/recognize", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);

    const { audio, format = "wav", sampleRate = 16000 } = await c.req.json();
    
    if (!audio) {
      return c.json({ error: "请提供音频数据" }, 400);
    }
    
    const appId = Deno.env.get('XFYUN_APP_ID') || '';
    const apiKey = Deno.env.get('XFYUN_API_KEY') || '';
    const apiSecret = Deno.env.get('XFYUN_API_SECRET') || '';
    
    // 如果未配置API密钥，使用本地智能分析模拟
    if (!appId || !apiKey || !apiSecret) {
      console.log("[声音识别] 科大讯飞 API 未配置，使用本地智能分析模式");
      const result = await localSoundAnalysis(audio);
      return c.json({ 
        success: true, 
        result,
        mode: "local",
        message: "当前使用本地分析模式，配置科大讯飞API后可获得更精准的识别结果"
      });
    }
    
    // 调用科大讯飞 声音事件检测 WebAPI
    // 构建鉴权参数 (按照讯飞WebAPI鉴权规范)
    const host = "api.xf-yun.com";
    const date = new Date().toUTCString();
    const path = "/v1/private/s67c9c78c";
    
    // HMAC-SHA256 签名
    const signatureOrigin = `host: ${host}\ndate: ${date}\nPOST ${path} HTTP/1.1`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(signatureOrigin);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
    const authorization = btoa(authorizationOrigin);
    
    // 构建请求URL
    const requestUrl = `https://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
    
    // 构建请求体
    const requestBody = {
      header: {
        app_id: appId,
        status: 3 // 一次性上传
      },
      parameter: {
        s67c9c78c: {
          func: "sound_event",
          soundEventResult: {
            encoding: "utf8",
            compress: "raw",
            format: "json"
          }
        }
      },
      payload: {
        s67c9c78cData: {
          encoding: format === "wav" ? "raw" : format,
          sample_rate: sampleRate,
          channels: 1,
          bit_depth: 16,
          status: 3,
          audio: audio // Base64编码的音频
        }
      }
    };
    
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    
    const responseData = await response.json();
    
    if (responseData.header?.code !== 0) {
      console.error("[声音识别] 讯飞API错误:", responseData);
      // 降级到本地分析
      const fallbackResult = await localSoundAnalysis(audio);
      return c.json({ 
        success: true, 
        result: fallbackResult,
        mode: "local_fallback",
        message: "API调用失败，已降级为本地分析"
      });
    }
    
    // 解析讯飞返回结果
    const resultData = responseData.payload?.soundEventResult?.text;
    let parsedResult;
    if (resultData) {
      const decodedText = atob(resultData);
      parsedResult = JSON.parse(decodedText);
    }
    
    return c.json({ 
      success: true, 
      result: parsedResult,
      mode: "xfyun",
      message: "科大讯飞声音识别完成"
    });
  } catch (error: any) {
    console.error("[声音识别] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 本地声音分析 (当科大讯飞API未配置时的降级方案)
 * 基于音频特征进行基础的声音事件分类
 * 
 * @param audioBase64 - Base64编码的音频数据
 * @returns 分析结果对象
 */
async function localSoundAnalysis(audioBase64: string) {
  // 解码 Base64 音频数据并分析基本特征
  const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  
  // 计算基本音频特征
  let sum = 0;
  let max = 0;
  let zeroCrossings = 0;
  
  for (let i = 0; i < audioBytes.length; i++) {
    const sample = audioBytes[i] - 128; // 转换为有符号值
    sum += Math.abs(sample);
    max = Math.max(max, Math.abs(sample));
    
    if (i > 0) {
      const prevSample = audioBytes[i - 1] - 128;
      if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
        zeroCrossings++;
      }
    }
  }
  
  const avgAmplitude = sum / audioBytes.length;
  const zeroCrossingRate = zeroCrossings / audioBytes.length;
  
  // 基于简单规则的声音分类
  let soundType = "unknown";
  let confidence = 60;
  let label = "未知声音";
  
  if (max > 100 && zeroCrossingRate > 0.3) {
    soundType = "alarm";
    confidence = 75;
    label = "警报声";
  } else if (max > 80 && zeroCrossingRate < 0.15) {
    soundType = "knock";
    confidence = 70;
    label = "敲门声";
  } else if (avgAmplitude > 40 && zeroCrossingRate > 0.2) {
    soundType = "doorbell";
    confidence = 72;
    label = "门铃声";
  } else if (avgAmplitude > 30 && zeroCrossingRate > 0.25) {
    soundType = "phone";
    confidence = 68;
    label = "电话铃声";
  } else if (avgAmplitude > 35 && zeroCrossingRate < 0.2) {
    soundType = "baby";
    confidence = 65;
    label = "婴儿哭声";
  } else if (avgAmplitude > 20) {
    soundType = "dog";
    confidence = 62;
    label = "狗叫声";
  }
  
  return {
    soundType,
    confidence,
    label,
    features: {
      avgAmplitude: Math.round(avgAmplitude * 100) / 100,
      maxAmplitude: max,
      zeroCrossingRate: Math.round(zeroCrossingRate * 1000) / 1000,
    }
  };
}

/** 保存声音检测记录 */
app.post("/make-server-481f4acb/sound/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const body = await c.req.json();
    const recordId = `${user.id}_${Date.now()}`;
    const record = {
      id: recordId,
      userId: user.id,
      ...body,
      createdAt: Date.now()
    };
    
    await safeKv.set(`sound_${recordId}`, JSON.stringify(record));
    return c.json({ success: true, record });
  } catch (error: any) {
    console.error("[声音保存] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 获取声音检测历史 */
app.get("/make-server-481f4acb/sound/history", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const keys = await safeKv.getByPrefix("sound_");
    const records = keys
      .map((val: any) => typeof val === 'string' ? JSON.parse(val) : val)
      .filter((record: any) => record.userId === user.id)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return c.json({ records });
  } catch (error: any) {
    console.error("[声音历史] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 8. 社区帖子模块
// ============================================================

/**
 * 创建帖子
 * POST /posts
 * 
 * @body {string} content - 帖子内容
 * @body {string} [author] - 作者名称
 * @body {string} [avatar] - 作者头像URL
 * @body {string[]} [images] - 图片URL列表
 */
app.post("/make-server-481f4acb/posts", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    const body = await c.req.json();
    const postId = Date.now().toString();
    
    const post = {
      id: postId,
      userId: user.id,
      author: {
        name: body.author || user.user_metadata?.name || '匿名用户',
        avatar: body.avatar || user.user_metadata?.avatar_url || '',
        verified: true
      },
      content: body.content || '',
      images: body.images || [],
      likes: 0,
      comments: 0,
      shares: 0,
      isLiked: false,
      isBookmarked: false,
      timeAgo: "刚刚",
      createdAt: Date.now()
    };
    
    await safeKv.set(`post_${postId}`, JSON.stringify(post));
    return c.json({ success: true, post });
  } catch (error: any) {
    console.error("[发帖] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取帖子列表
 * GET /posts
 * 
 * 自动更新每条帖子的相对时间
 */
app.get("/make-server-481f4acb/posts", async (c) => {
  try {
    const user = await authenticateUser(c);
    const feed = c.req.query("feed");
    const keys = await safeKv.getByPrefix("post_");
    let posts = keys
      .map(parseStoredValue)
      .filter(Boolean)
      .map((post: any) => {
        if (post.createdAt) {
          post.timeAgo = formatTimeAgo(post.createdAt);
        }
        if (typeof post.author === 'string') {
          post.author = { name: post.author, avatar: post.avatar || '', verified: false };
        }
        return post;
      });

    if (feed === "following") {
      if (!user) return c.json({ error: "请先登录" }, 401);

      const follows = await getFollowEntries();
      const followingIds = new Set(
        follows
          .filter((item: any) => item.followerId === user.id)
          .map((item: any) => item.followingId)
      );
      posts = posts.filter((post: any) => followingIds.has(post.userId));
    }

    posts = posts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    if (user) {
      posts = await Promise.all(posts.map(async (post: any) => ({
        ...post,
        isBookmarked: Boolean(await safeKv.get(`bookmark_${user.id}_${post.id}`)),
      })));
    }
    
    return c.json({ posts });
  } catch (error: any) {
    console.error("[获取帖子] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 获取单条帖子详情 */
app.get("/make-server-481f4acb/posts/:id", async (c) => {
  try {
    const user = await authenticateUser(c);
    const postId = c.req.param("id");
    const stored = parseStoredValue(await safeKv.get(`post_${postId}`));

    if (!stored) {
      return c.json({ error: "帖子不存在" }, 404);
    }

    if (stored.createdAt) {
      stored.timeAgo = formatTimeAgo(stored.createdAt);
    }
    if (typeof stored.author === "string") {
      stored.author = { name: stored.author, avatar: stored.avatar || "", verified: false };
    }
    if (user) {
      stored.isBookmarked = Boolean(await safeKv.get(`bookmark_${user.id}_${postId}`));
    }

    return c.json(stored);
  } catch (error: any) {
    console.error("[帖子详情] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 删除帖子 */
app.delete("/make-server-481f4acb/posts/:id", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const postId = c.req.param('id');
    const postStr = await safeKv.get(`post_${postId}`);
    if (!postStr) return c.json({ error: "帖子不存在" }, 404);
    
    const post = typeof postStr === 'string' ? JSON.parse(postStr) : postStr;
    if (post.userId !== user.id) {
      return c.json({ error: "无权删除此帖子" }, 403);
    }
    
    await safeKv.del(`post_${postId}`);
    
    // 同时删除相关评论
    const comments = await safeKv.getByPrefix(`comment_${postId}_`);
    for (const comment of comments) {
      const parsed = typeof comment === 'string' ? JSON.parse(comment) : comment;
      if (parsed.id) await safeKv.del(`comment_${postId}_${parsed.id}`);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error("[删除帖子] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 点赞/取消点赞 */
app.post("/make-server-481f4acb/posts/:id/like", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const postId = c.req.param('id');
    const postKey = `post_${postId}`;
    const postStr = await safeKv.get(postKey);
    
    if (!postStr) return c.json({ error: "帖子不存在" }, 404);
    
    const post = typeof postStr === 'string' ? JSON.parse(postStr) : postStr;
    const likeKey = `like_${user.id}_${postId}`;
    const likeExists = await safeKv.get(likeKey);
    
    if (likeExists) {
      await safeKv.del(likeKey);
      post.likes = Math.max(0, (post.likes || 0) - 1);
    } else {
      await safeKv.set(likeKey, "true");
      post.likes = (post.likes || 0) + 1;
    }
    
    await safeKv.set(postKey, JSON.stringify(post));
    return c.json({ success: true, liked: !likeExists, likes: post.likes });
  } catch (error: any) {
    console.error("[点赞] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/** 收藏/取消收藏 */
app.post("/make-server-481f4acb/posts/:id/bookmark", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const postId = c.req.param('id');
    const bookmarkKey = `bookmark_${user.id}_${postId}`;
    const bookmarkExists = await safeKv.get(bookmarkKey);
    
    if (bookmarkExists) {
      await safeKv.del(bookmarkKey);
      return c.json({ success: true, bookmarked: false });
    } else {
      await safeKv.set(bookmarkKey, "true");
      return c.json({ success: true, bookmarked: true });
    }
  } catch (error: any) {
    console.error("[收藏] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 9. 评论系统
// ============================================================

/**
 * 添加评论
 * POST /posts/:id/comments
 * 
 * @body {string} content - 评论内容
 */
app.post("/make-server-481f4acb/posts/:id/comments", async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user) return c.json({ error: "请先登录" }, 401);
    
    const postId = c.req.param('id');
    const { content } = await c.req.json();
    
    if (!content?.trim()) {
      return c.json({ error: "评论内容不能为空" }, 400);
    }
    
    // 验证帖子存在
    const postStr = await safeKv.get(`post_${postId}`);
    if (!postStr) return c.json({ error: "帖子不存在" }, 404);
    
    const commentId = Date.now().toString();
    const comment = {
      id: commentId,
      postId,
      userId: user.id,
      author: {
        name: user.user_metadata?.name || '匿名用户',
        avatar: user.user_metadata?.avatar_url || '',
      },
      content: content.trim(),
      likes: 0,
      timeAgo: "刚刚",
      createdAt: Date.now()
    };
    
    await safeKv.set(`comment_${postId}_${commentId}`, JSON.stringify(comment));
    
    // 更新帖子评论数
    const post = typeof postStr === 'string' ? JSON.parse(postStr) : postStr;
    post.comments = (post.comments || 0) + 1;
    await safeKv.set(`post_${postId}`, JSON.stringify(post));
    
    return c.json({ success: true, comment });
  } catch (error: any) {
    console.error("[评论] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 获取帖子评论列表
 * GET /posts/:id/comments
 */
app.get("/make-server-481f4acb/posts/:id/comments", async (c) => {
  try {
    const postId = c.req.param('id');
    const keys = await safeKv.getByPrefix(`comment_${postId}_`);
    
    const comments = keys
      .map((val: any) => {
        const comment = typeof val === 'string' ? JSON.parse(val) : val;
        if (comment.createdAt) {
          comment.timeAgo = formatTimeAgo(comment.createdAt);
        }
        return comment;
      })
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return c.json({ comments });
  } catch (error: any) {
    console.error("[获取评论] 异常:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================================
// 启动服务
// ============================================================

Deno.serve(app.fetch);
