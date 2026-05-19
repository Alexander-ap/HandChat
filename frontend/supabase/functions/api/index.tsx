import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "../server/kv_store.tsx";

const app = new Hono();

app.onError((err, c) => {
  c.header("Access-Control-Allow-Origin", "*");
  return c.json({ error: err.message || "服务器内部错误" }, 500);
});

app.use("*", logger(console.log));
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-user-jwt", "x-client-info", "apikey", "X-Requested-With"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: false,
  })
);

app.options("*", (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-jwt, x-client-info, apikey, X-Requested-With");
  c.header("Access-Control-Max-Age", "86400");
  return c.text("", 204);
});

const safeKv = {
  async set(key: string, value: string): Promise<boolean> {
    try {
      await kv.set(key, value);
      return true;
    } catch (_error) {
      const message = `[KV] set 失败 (key=${key}): ${(_error as any)?.message ?? String(_error)}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 是否已创建，且 Edge Function 已配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。`);
    }
  },
  async get(key: string): Promise<any> {
    try {
      return await kv.get(key);
    } catch (_error) {
      const message = `[KV] get 失败 (key=${key}): ${(_error as any)?.message ?? String(_error)}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
  async del(key: string): Promise<boolean> {
    try {
      await kv.del(key);
      return true;
    } catch (_error) {
      const message = `[KV] del 失败 (key=${key}): ${(_error as any)?.message ?? String(_error)}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
  async getByPrefix(prefix: string): Promise<any[]> {
    try {
      return await kv.getByPrefix(prefix);
    } catch (_error) {
      const message = `[KV] getByPrefix 失败 (prefix=${prefix}): ${(_error as any)?.message ?? String(_error)}`;
      console.error(message);
      throw new Error(`${message}。请检查 Supabase KV 表 kv_store_eb001b4e 与数据库连接配置。`);
    }
  },
};

const getSupabase = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return createClient(supabaseUrl, supabaseKey);
};

const authenticateUser = async (c: any) => {
  const accessToken = c.req.header("x-user-jwt") || c.req.header("Authorization")?.split(" ")[1];
  if (!accessToken) return null;
  const supabase = getSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
};

function parseJson(value: any) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getLimitOffset(c: any, defaults: { limit: number; offset: number }, maxLimit: number) {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || defaults.limit, 1), maxLimit);
  const offset = Math.max(Number(c.req.query("offset")) || defaults.offset, 0);
  return { limit, offset };
}

function getLimit(c: any, defaults: { limit: number }, maxLimit: number) {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || defaults.limit, 1), maxLimit);
  return { limit };
}

function deriveTitle(content: string) {
  const trimmed = (content || "").trim();
  if (!trimmed) return "帖子";
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}…` : trimmed;
}

async function requireUser(c: any) {
  const user = await authenticateUser(c);
  if (!user) return { user: null, response: c.json({ error: "未认证" }, 401) };
  return { user, response: null };
}

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/sessions", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const { limit, offset } = getLimitOffset(c, { limit: 20, offset: 0 }, 50);
  const values = await safeKv.getByPrefix("session_");
  const sessions = values
    .map(parseJson)
    .filter((item: any) => item?.userId === user.id)
    .sort((a: any, b: any) => Number(b.startedAtMs || 0) - Number(a.startedAtMs || 0))
    .slice(offset, offset + limit)
    .map((item: any) => ({
      id: String(item.id),
      status: item.status === "active" ? "active" : "ended",
      startedAt: toIso(item.startedAtMs) || new Date().toISOString(),
      endedAt: toIso(item.endedAtMs),
      translationCount: Number(item.translationCount || 0),
      lastTranslation: item.lastTranslation ?? null,
    }));

  return c.json(sessions);
});

app.get("/sessions/:id", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const sessionId = c.req.param("id");
  const stored = parseJson(await safeKv.get(`session_${sessionId}`));
  if (!stored || stored.userId !== user.id) {
    return c.json({ error: "会话不存在" }, 404);
  }

  return c.json({
    id: String(stored.id),
    status: stored.status === "active" ? "active" : "ended",
    startedAt: toIso(stored.startedAtMs) || new Date().toISOString(),
    endedAt: toIso(stored.endedAtMs),
    translationCount: Number(stored.translationCount || 0),
  });
});

app.get("/sessions/:id/history", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const sessionId = c.req.param("id");
  const stored = parseJson(await safeKv.get(`session_${sessionId}`));
  if (!stored || stored.userId !== user.id) {
    return c.json({ error: "会话不存在" }, 404);
  }

  const { limit } = getLimit(c, { limit: 100 }, 500);
  const values = await safeKv.getByPrefix(`session_history_${sessionId}_`);
  const items = values
    .map(parseJson)
    .filter(Boolean)
    .sort((a: any, b: any) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))
    .slice(0, limit)
    .map((item: any) => ({
      text: String(item.text || ""),
      confidence: Number(item.confidence || 0),
      type: item.type === "final" ? "final" : "final",
      gestureLabel: item.gestureLabel ?? null,
      frameId: item.frameId ?? null,
      createdAt: toIso(item.createdAtMs) || new Date().toISOString(),
    }));

  return c.json(items);
});

app.get("/user/profile", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const cached = parseJson(await safeKv.get(`user_profile_${user.id}`));
  return c.json({
    nickname: cached?.nickname ?? user.user_metadata?.name ?? null,
    avatar: cached?.avatar ?? user.user_metadata?.avatar_url ?? null,
    bio: cached?.bio ?? user.user_metadata?.bio ?? null,
  });
});

app.put("/user/profile", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const body = await c.req.json();
  const nickname = body.nickname ?? body.name;
  const avatar = body.avatar ?? body.avatar_url;
  const bio = body.bio;

  const nextProfile = {
    userId: user.id,
    nickname: nickname !== undefined ? (nickname === null ? null : String(nickname)) : null,
    avatar: avatar !== undefined ? (avatar === null ? null : String(avatar)) : null,
    bio: bio !== undefined ? (bio === null ? null : String(bio)) : null,
    updatedAtMs: Date.now(),
  };

  try {
    const supabase = getSupabase();
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        ...(nickname !== undefined ? { name: nickname } : {}),
        ...(avatar !== undefined ? { avatar_url: avatar } : {}),
        ...(bio !== undefined ? { bio } : {}),
      },
    });
  } catch (_error) {
  }

  await safeKv.set(`user_profile_${user.id}`, JSON.stringify(nextProfile));
  return c.json({
    nickname: nextProfile.nickname,
    avatar: nextProfile.avatar,
    bio: nextProfile.bio,
  });
});

const DEFAULT_USER_SETTINGS = {
  notification: true,
  vibration: true,
  language: "zh-CN",
};

app.get("/user/settings", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const stored = parseJson(await safeKv.get(`user_settings_${user.id}`));
  return c.json({
    ...DEFAULT_USER_SETTINGS,
    ...(stored || {}),
  });
});

app.put("/user/settings", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const body = await c.req.json();
  const current = parseJson(await safeKv.get(`user_settings_${user.id}`)) || {};
  const nextSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...current,
    ...(body.notification !== undefined ? { notification: Boolean(body.notification) } : {}),
    ...(body.vibration !== undefined ? { vibration: Boolean(body.vibration) } : {}),
    ...(body.language !== undefined ? { language: String(body.language) } : {}),
  };

  await safeKv.set(`user_settings_${user.id}`, JSON.stringify(nextSettings));
  return c.json(nextSettings);
});

async function getFollowEntries() {
  const values = await safeKv.getByPrefix("follow_");
  return values
    .map(parseJson)
    .filter((item: any) => item?.followerId && item?.followingId);
}

async function getUserBasicProfile(userId: string) {
  const cachedProfile = parseJson(await safeKv.get(`user_profile_${userId}`));
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

    const profile = {
      nickname: data.user.user_metadata?.name ?? null,
      avatar: data.user.user_metadata?.avatar_url ?? null,
      bio: data.user.user_metadata?.bio ?? null,
    };
    await safeKv.set(
      `user_profile_${userId}`,
      JSON.stringify({
        userId,
        ...profile,
        updatedAtMs: Date.now(),
      })
    );

    return { userId, ...profile };
  } catch (_error) {
    return { userId, nickname: null, avatar: null, bio: null };
  }
}

app.get("/user/:id/basic", async (c) => {
  const userId = c.req.param("id");
  return c.json(await getUserBasicProfile(userId));
});

app.get("/user/stats", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const [posts, follows, statsStr] = await Promise.all([
    safeKv.getByPrefix("post_"),
    getFollowEntries(),
    safeKv.get(`user_stats_${user.id}`),
  ]);

  const stats = parseJson(statsStr) || {};
  const postCount = posts.map(parseJson).filter((item: any) => item?.userId === user.id).length;
  const followingCount = follows.filter((item: any) => item.followerId === user.id).length;
  const followerCount = follows.filter((item: any) => item.followingId === user.id).length;

  const achievementState = parseJson(await safeKv.get(`user_achievements_${user.id}`)) || {};
  const achievementCount = Object.values(achievementState).filter(Boolean).length;

  return c.json({
    stats: {
      postCount,
      followingCount,
      followerCount,
      points: Number(stats.points || 0),
      achievementCount,
      days: Number(stats.days || 1),
      loginStreak: Number(stats.loginStreak || 1),
      totalTranslations: Number(stats.totalTranslations || 0),
      totalOcr: Number(stats.totalOcr || 0),
      totalSoundDetections: Number(stats.totalSoundDetections || 0),
    },
  });
});

app.get("/user/stats/daily", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const days = Math.min(Math.max(Number(c.req.query("days")) || 7, 1), 30);
  const [signRecords, ocrRecords, soundRecords, posts] = await Promise.all([
    safeKv.getByPrefix("sign_"),
    safeKv.getByPrefix("ocr_"),
    safeKv.getByPrefix("sound_"),
    safeKv.getByPrefix("post_"),
  ]);

  const counters: Record<string, number> = {};
  const collect = (values: any[]) => {
    values
      .map(parseJson)
      .filter((item: any) => item?.createdAt && item?.userId === user.id)
      .forEach((item: any) => {
        const date = new Date(item.createdAt).toISOString().slice(0, 10);
        counters[date] = (counters[date] || 0) + 1;
      });
  };

  collect(signRecords);
  collect(ocrRecords);
  collect(soundRecords);
  collect(posts);

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    result.push({ date, count: counters[date] || 0 });
  }
  return c.json(result);
});

app.get("/user/:id/followers", async (c) => {
  const userId = c.req.param("id");
  const follows = await getFollowEntries();
  return c.json({
    users: follows
      .filter((item: any) => item.followingId === userId)
      .map((item: any) => ({ userId: item.followerId })),
  });
});

app.get("/user/:id/following", async (c) => {
  const userId = c.req.param("id");
  const follows = await getFollowEntries();
  return c.json({
    users: follows
      .filter((item: any) => item.followerId === userId)
      .map((item: any) => ({ userId: item.followingId })),
  });
});

app.get("/user/:id/followers/count", async (c) => {
  const userId = c.req.param("id");
  const follows = await getFollowEntries();
  return c.json({ count: follows.filter((item: any) => item.followingId === userId).length });
});

app.get("/user/:id/following/count", async (c) => {
  const userId = c.req.param("id");
  const follows = await getFollowEntries();
  return c.json({ count: follows.filter((item: any) => item.followerId === userId).length });
});

app.post("/user/:id/follow", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const targetUserId = c.req.param("id");
  if (targetUserId === user.id) {
    return c.json({ error: "Cannot follow yourself" }, 400);
  }

  await safeKv.set(
    `follow_${user.id}_${targetUserId}`,
    JSON.stringify({ followerId: user.id, followingId: targetUserId, createdAtMs: Date.now() })
  );
  return c.json({ success: true, following: true });
});

app.delete("/user/:id/follow", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const targetUserId = c.req.param("id");
  await safeKv.del(`follow_${user.id}_${targetUserId}`);
  return c.json({ success: true, following: false });
});

app.get("/user/:id/is-following", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const targetUserId = c.req.param("id");
  const exists = await safeKv.get(`follow_${user.id}_${targetUserId}`);
  return c.json({ following: Boolean(exists) });
});

app.get("/points", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const values = await safeKv.getByPrefix(`points_${user.id}_`);
  const balance = values
    .map(parseJson)
    .filter((item: any) => item?.userId === user.id)
    .reduce((sum: number, item: any) => sum + Number(item.points || 0), 0);
  const totalEarned = values
    .map(parseJson)
    .filter((item: any) => item?.userId === user.id && Number(item.points || 0) > 0)
    .reduce((sum: number, item: any) => sum + Number(item.points || 0), 0);

  return c.json({ balance, totalEarned });
});

app.get("/points/history", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const { limit, offset } = getLimitOffset(c, { limit: 20, offset: 0 }, 100);
  const values = await safeKv.getByPrefix(`points_${user.id}_`);
  const records = values
    .map(parseJson)
    .filter((item: any) => item?.userId === user.id)
    .sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  const page = records.slice(offset, offset + limit).map((item: any) => ({
    id: String(item.id),
    amount: Number(item.points || 0),
    reason: String(item.title || ""),
    createdAt: toIso(item.createdAt) || new Date().toISOString(),
  }));

  return c.json({ records: page, total: records.length, limit, offset });
});

const ACHIEVEMENTS = [
  {
    id: "first_sign",
    name: "初识手语",
    description: "完成第一次手语识别",
    icon: "hand",
    sortOrder: 1,
    progressField: "totalTranslations",
    threshold: 1,
  },
  {
    id: "first_post",
    name: "社区新声",
    description: "发布第一篇帖子",
    icon: "message_circle",
    sortOrder: 2,
    progressField: "postCount",
    threshold: 1,
  },
  {
    id: "login_3",
    name: "坚持三天",
    description: "连续登录 3 天",
    icon: "zap",
    sortOrder: 3,
    progressField: "loginStreak",
    threshold: 3,
  },
  {
    id: "login_7",
    name: "一周达人",
    description: "连续登录 7 天",
    icon: "trophy",
    sortOrder: 4,
    progressField: "loginStreak",
    threshold: 7,
  },
];

const achievementsCache = new Map<string, { expiresAt: number; data: any }>();

app.get("/achievements", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const cached = achievementsCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.data);
  }

  const [statsResponse, storedStateStr] = await Promise.all([
    (async () => {
      const [posts, follows, statsStr] = await Promise.all([
        safeKv.getByPrefix("post_"),
        getFollowEntries(),
        safeKv.get(`user_stats_${user.id}`),
      ]);
      const stats = parseJson(statsStr) || {};
      const postCount = posts.map(parseJson).filter((item: any) => item?.userId === user.id).length;
      const followingCount = follows.filter((item: any) => item.followerId === user.id).length;
      const followerCount = follows.filter((item: any) => item.followingId === user.id).length;
      return {
        postCount,
        followingCount,
        followerCount,
        points: Number(stats.points || 0),
        days: Number(stats.days || 1),
        loginStreak: Number(stats.loginStreak || 1),
        totalTranslations: Number(stats.totalTranslations || 0),
        totalOcr: Number(stats.totalOcr || 0),
        totalSoundDetections: Number(stats.totalSoundDetections || 0),
      };
    })(),
    safeKv.get(`user_achievements_${user.id}`),
  ]);

  const storedState = parseJson(storedStateStr) || {};
  const nextState = { ...storedState };

  const payload = ACHIEVEMENTS.map((achievement) => {
    const progressValue = Number((statsResponse as any)[achievement.progressField] || 0);
    const progress = Math.min(progressValue, achievement.threshold);
    const unlockedAt = nextState[achievement.id] || null;
    const shouldUnlock = progressValue >= achievement.threshold;
    const resolvedUnlockedAt = shouldUnlock
      ? unlockedAt || new Date().toISOString()
      : null;
    if (resolvedUnlockedAt && !nextState[achievement.id]) {
      nextState[achievement.id] = resolvedUnlockedAt;
    }
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon,
      sortOrder: achievement.sortOrder,
      unlockedAt: resolvedUnlockedAt,
      progress,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  if (JSON.stringify(nextState) !== JSON.stringify(storedState)) {
    await safeKv.set(`user_achievements_${user.id}`, JSON.stringify(nextState));
  }

  achievementsCache.set(user.id, { expiresAt: Date.now() + 5 * 60_000, data: payload });
  return c.json(payload);
});

function mapPostToApi(post: any) {
  const createdAtIso = toIso(post.createdAt) || new Date().toISOString();
  const authorId = String(post.userId || "");
  const content = String(post.content || "");
  const title = String(post.title || deriveTitle(content));
  return {
    id: String(post.id),
    title,
    content,
    author: authorId,
    authorId,
    avatar: "",
    likes: Number(post.likes || 0),
    commentCount: Number(post.comments || 0),
    createdAt: createdAtIso,
  };
}

async function getPostComments(postId: string) {
  const values = await safeKv.getByPrefix(`comment_${postId}_`);
  return values
    .map(parseJson)
    .filter(Boolean)
    .sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

app.get("/posts", async (c) => {
  const { limit, offset } = getLimitOffset(c, { limit: 20, offset: 0 }, 50);
  const feed = c.req.query("feed");
  const user = await authenticateUser(c);

  const values = await safeKv.getByPrefix("post_");
  let posts = values
    .map(parseJson)
    .filter(Boolean)
    .sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  if (feed === "following") {
    if (!user) {
      return c.json({ error: "未认证" }, 401);
    }
    const follows = await getFollowEntries();
    const followingIds = new Set(
      follows.filter((item: any) => item.followerId === user.id).map((item: any) => item.followingId)
    );
    posts = posts.filter((post: any) => followingIds.has(post.userId));
  }

  posts = posts.slice(offset, offset + limit);

  const result = await Promise.all(
    posts.map(async (post: any) => {
      const base = mapPostToApi(post);
      const comments = (await getPostComments(String(post.id)))
        .slice(0, 3)
        .map((comment: any) => ({
          id: String(comment.id),
          content: String(comment.content || ""),
          author: String(comment.userId || ""),
          authorId: String(comment.userId || ""),
          createdAt: toIso(comment.createdAt) || new Date().toISOString(),
        }));
      return { ...base, comments };
    })
  );

  return c.json(result);
});

app.post("/posts", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const body = await c.req.json();
  const rawTitle = body.title;
  const rawContent = body.content;
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : deriveTitle(content);

  if (!title || !content) {
    return c.json({ error: "Title and content are required" }, 400);
  }
  if (title.length > 200 || content.length > 10000) {
    return c.json({ error: "Title or content exceeds maximum length" }, 400);
  }

  const postId = crypto.randomUUID();
  const createdAtMs = Date.now();
  const post = {
    id: postId,
    userId: user.id,
    author: {
      name: user.user_metadata?.name || "匿名用户",
      avatar: user.user_metadata?.avatar_url || "",
      verified: true,
    },
    title,
    content,
    images: [],
    likes: 0,
    comments: 0,
    shares: 0,
    isLiked: false,
    isBookmarked: false,
    timeAgo: "刚刚",
    createdAt: createdAtMs,
  };

  await safeKv.set(`post_${postId}`, JSON.stringify(post));
  return c.json({ success: true, post }, 201);
});

app.delete("/posts/:id", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const postId = c.req.param("id");
  const postStr = await safeKv.get(`post_${postId}`);
  if (!postStr) return c.json({ error: "帖子不存在" }, 404);

  const post = parseJson(postStr);
  if (!post || post.userId !== user.id) {
    return c.json({ error: "帖子不存在" }, 404);
  }

  await safeKv.del(`post_${postId}`);
  const comments = await safeKv.getByPrefix(`comment_${postId}_`);
  for (const comment of comments) {
    const parsed = parseJson(comment);
    if (parsed?.id) await safeKv.del(`comment_${postId}_${parsed.id}`);
  }

  return c.json({ success: true });
});

app.post("/posts/:id/like", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const postId = c.req.param("id");
  const postKey = `post_${postId}`;
  const postStr = await safeKv.get(postKey);
  if (!postStr) return c.json({ error: "帖子不存在" }, 404);

  const post = parseJson(postStr);
  const likeKey = `like_${user.id}_${postId}`;
  const likeExists = await safeKv.get(likeKey);
  if (!likeExists) {
    await safeKv.set(likeKey, "true");
    post.likes = (post.likes || 0) + 1;
    await safeKv.set(postKey, JSON.stringify(post));
  }

  return c.json({ likes: Number(post.likes || 0) });
});

app.post("/posts/:id/bookmark", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const postId = c.req.param("id");
  const bookmarkKey = `bookmark_${user.id}_${postId}`;
  const exists = await safeKv.get(bookmarkKey);
  if (exists) {
    await safeKv.del(bookmarkKey);
    return c.json({ bookmarked: false });
  }
  await safeKv.set(bookmarkKey, "true");
  return c.json({ bookmarked: true });
});

app.post("/posts/:id/comments", async (c) => {
  const { user, response } = await requireUser(c);
  if (!user) return response;

  const postId = c.req.param("id");
  const postStr = await safeKv.get(`post_${postId}`);
  if (!postStr) return c.json({ error: "帖子不存在" }, 404);

  const body = await c.req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return c.json({ error: "Content is required" }, 400);
  }
  if (content.length > 5000) {
    return c.json({ error: "Comment too long" }, 400);
  }

  const commentId = crypto.randomUUID();
  const createdAtMs = Date.now();
  const comment = {
    id: commentId,
    postId,
    userId: user.id,
    content,
    createdAt: createdAtMs,
  };

  await safeKv.set(`comment_${postId}_${commentId}`, JSON.stringify(comment));
  const post = parseJson(postStr);
  post.comments = (post.comments || 0) + 1;
  await safeKv.set(`post_${postId}`, JSON.stringify(post));

  return c.json(
    {
      success: true,
      comment: {
        id: commentId,
        postId,
        author: {
          name: user.user_metadata?.name || "匿名用户",
          avatar: user.user_metadata?.avatar_url || "",
        },
        authorId: user.id,
        content,
        likes: 0,
        timeAgo: "刚刚",
        createdAt: new Date(createdAtMs).toISOString(),
      },
    },
    201
  );
});

app.get("/posts/:id/comments", async (c) => {
  const postId = c.req.param("id");
  const { limit, offset } = getLimitOffset(c, { limit: 20, offset: 0 }, 100);
  const comments = await getPostComments(postId);

  const page = comments.slice(offset, offset + limit).map((comment: any) => ({
    id: String(comment.id),
    content: String(comment.content || ""),
    authorId: String(comment.userId || ""),
    createdAt: toIso(comment.createdAt) || new Date().toISOString(),
  }));

  return c.json({ comments: page });
});

Deno.serve(app.fetch);
