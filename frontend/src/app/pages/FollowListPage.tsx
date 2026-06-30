/**
 * 关注/粉丝列表页面
 *
 * 功能: 分Tab查看关注列表和粉丝列表，支持关注/取关操作
 * URL: /profile/follow?tab=following|followers
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Users, UserPlus, UserMinus, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { followApi, getCurrentAuthUserId, userApi } from "../lib/api";

/** 列表中的用户数据结构 */
interface FollowUser {
  userId: string;
  displayId: string;
  name: string;
  subtitle: string;
  avatarUrl: string;
  isFollowing: boolean;
  loading: boolean;
}

/** 从完整userId生成缩略显示ID */
function shortId(id: string): string {
  return id.substring(0, 8).toUpperCase();
}

export default function FollowListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "followers" ? "followers" : "following";

  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [followingList, setFollowingList] = useState<FollowUser[]>([]);
  const [followerList, setFollowerList] = useState<FollowUser[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const buildUsers = useCallback(async (userIds: string[], followingIds: Set<string>) => {
    return Promise.all(
      userIds.map(async (id) => {
        const displayId = shortId(id);

        try {
          const basic = await userApi.getBasic(id);
          const nickname = basic?.nickname?.trim();

          return {
            userId: id,
            displayId,
            name: nickname || `ID: ${displayId}`,
            subtitle: nickname ? `ID: ${displayId}` : "手语用户",
            avatarUrl: basic?.avatar || "",
            isFollowing: followingIds.has(id),
            loading: false,
          };
        } catch (e: any) {
          console.warn("[关注列表] 获取用户资料失败:", id, e.message || e);
          return {
            userId: id,
            displayId,
            name: `ID: ${displayId}`,
            subtitle: "手语用户",
            avatarUrl: "",
            isFollowing: followingIds.has(id),
            loading: false,
          };
        }
      })
    );
  }, []);

  /** 切换Tab */
  const handleTabChange = (value: string) => {
    setSearchParams(value === "followers" ? { tab: "followers" } : { tab: "following" });
  };

  /** 获取关注列表 */
  const fetchFollowing = useCallback(async (userId: string) => {
    try {
      const data = await followApi.getFollowing(userId);
      const userIds: string[] = (data.users || []).map((row: any) => row.userId).filter(Boolean);
      const users = await buildUsers(userIds, new Set(userIds));
      setFollowingList(users);
    } catch (e: any) {
      console.warn("[关注列表] 获取关注列表失败:", e.message || e);
      setFollowingList([]);
    }
  }, [buildUsers]);

  /** 获取粉丝列表 */
  const fetchFollowers = useCallback(async (userId: string) => {
    try {
      const data = await followApi.getFollowers(userId);
      const followerIds: string[] = (data.users || []).map((row: any) => row.userId).filter(Boolean);

      // 对于粉丝列表，需要判断是否已关注他们
      const followingIds = new Set(
        followingList.map((u) => u.userId)
      );

      const users = await buildUsers(followerIds, followingIds);
      setFollowerList(users);
    } catch (e: any) {
      console.warn("[关注列表] 获取粉丝列表失败:", e.message || e);
      setFollowerList([]);
    }
  }, [buildUsers, followingList]);

  /** 初始化数据 */
  useEffect(() => {
    const init = async () => {
      try {
        const uid = await getCurrentAuthUserId();
        if (!uid) {
          navigate("/login", { replace: true });
          return;
        }
        setCurrentUserId(uid);

        // 并行获取关注和粉丝计数
        const [followingRes, followerRes] = await Promise.all([
          followApi.getFollowingCount(uid).catch(() => ({ count: 0 })),
          followApi.getFollowerCount(uid).catch(() => ({ count: 0 })),
        ]);

        setFollowingCount(followingRes.count || 0);
        setFollowerCount(followerRes.count || 0);

        // 获取关注列表
        await fetchFollowing(uid);
      } catch (e: any) {
        console.warn("[关注列表] 初始化失败:", e.message || e);
        toast.error("加载失败，请重试");
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [navigate, fetchFollowing]);

  /** 关注列表变化后刷新粉丝列表(用于判断回关状态) */
  useEffect(() => {
    if (currentUserId && followingList.length >= 0) {
      fetchFollowers(currentUserId);
    }
  }, [followingList, currentUserId, fetchFollowers]);

  /** 关注/取关操作 */
  const handleToggleFollow = async (targetUser: FollowUser) => {
    // 乐观更新
    const updateList = (list: FollowUser[]) =>
      list.map((u) =>
        u.userId === targetUser.userId
          ? { ...u, isFollowing: !u.isFollowing, loading: true }
          : u
      );

    if (targetUser.isFollowing) {
      setFollowingList((prev) => updateList(prev));
      setFollowerList((prev) => updateList(prev));

      try {
        await followApi.unfollow(targetUser.userId);
        setFollowingList((prev) =>
          prev.map((u) =>
            u.userId === targetUser.userId
              ? { ...u, isFollowing: false, loading: false }
              : u
          )
        );
        setFollowerList((prev) =>
          prev.map((u) =>
            u.userId === targetUser.userId
              ? { ...u, isFollowing: false, loading: false }
              : u
          )
        );
        setFollowingCount((c) => Math.max(0, c - 1));
        toast.success("已取消关注");
      } catch (e: any) {
        // 回滚
        setFollowingList((prev) => updateList(prev));
        setFollowerList((prev) => updateList(prev));
        toast.error(e.message || "操作失败，请重试");
      }
    } else {
      setFollowerList((prev) => updateList(prev));
      setFollowingList((prev) => {
        if (!prev.find((u) => u.userId === targetUser.userId)) {
          return [...prev, { ...targetUser, isFollowing: true, loading: true }];
        }
        return updateList(prev);
      });

      try {
        await followApi.follow(targetUser.userId);
        setFollowerList((prev) =>
          prev.map((u) =>
            u.userId === targetUser.userId
              ? { ...u, isFollowing: true, loading: false }
              : u
          )
        );
        setFollowingList((prev) =>
          prev.map((u) =>
            u.userId === targetUser.userId
              ? { ...u, isFollowing: true, loading: false }
              : u
          )
        );
        setFollowingCount((c) => c + 1);
        toast.success("已关注");
      } catch (e: any) {
        // 回滚
        setFollowerList((prev) => updateList(prev));
        setFollowingList((prev) => {
          if (!prev.find((u) => u.userId === targetUser.userId)) {
            return prev.filter((u) => u.userId !== targetUser.userId);
          }
          return updateList(prev);
        });
        toast.error(e.message || "操作失败，请重试");
      }
    }
  };

  /** 渲染用户行 */
  const renderUserRow = (user: FollowUser) => (
    <div
      key={user.userId}
      className="bg-white rounded-[14px] p-3.5 shadow-sm flex items-center gap-3.5"
    >
      <Avatar className="w-11 h-11 flex-shrink-0">
        <AvatarImage src={user.avatarUrl} className="object-cover" />
        <AvatarFallback className="bg-gray-100 text-gray-500 text-[15px] font-medium">
          {user.name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-black truncate">
          {user.name}
        </h3>
        <p className="text-[12px] text-gray-400 truncate">{user.subtitle}</p>
      </div>
      <Button
        variant={user.isFollowing ? "outline" : "default"}
        size="sm"
        disabled={user.loading}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleFollow(user);
        }}
        className={
          user.isFollowing
            ? "h-8 rounded-full border-gray-300 text-gray-500 text-[13px] px-3.5"
            : "h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[13px] px-3.5"
        }
      >
        {user.loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : user.isFollowing ? (
          <>
            <UserMinus className="w-3.5 h-3.5 mr-1" />
            已关注
          </>
        ) : (
          <>
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            关注
          </>
        )}
      </Button>
    </div>
  );

  const tabValue = activeTab;

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20" style={{ background: 'var(--app-background, #F2F2F7)' }}>
        <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex items-center justify-center border-b border-black/5">
          <div className="w-full max-w-2xl flex items-center justify-center relative">
            <Button
              variant="ghost" size="sm" onClick={() => navigate("/profile")}
              className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />返回
            </Button>
            <h1 className="text-[17px] font-semibold text-black">关注与粉丝</h1>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      {/* iOS 风格头部 */}
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-14 pb-3 sticky top-0 z-50 flex items-center justify-center border-b border-black/5">
        <div className="w-full max-w-2xl flex items-center justify-center relative">
          <Button
            variant="ghost" size="sm" onClick={() => navigate("/profile")}
            className="text-blue-500 hover:text-blue-600 hover:bg-transparent px-0 font-medium text-[17px] absolute left-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />返回
          </Button>
          <h1 className="text-[17px] font-semibold text-black">关注与粉丝</h1>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3 w-full max-w-2xl mx-auto">
        {/* Tab 切换 */}
        <Tabs value={tabValue} onValueChange={handleTabChange} className="w-full">
          <div className="px-0 mb-3">
            <TabsList className="w-full bg-gray-100/80 rounded-[12px] p-[3px] h-10">
              <TabsTrigger
                value="following"
                className="flex-1 h-full rounded-[10px] text-[14px] font-medium data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm text-gray-500"
              >
                关注
                <span className="ml-1.5 text-[12px] opacity-60">
                  {followingCount}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="followers"
                className="flex-1 h-full rounded-[10px] text-[14px] font-medium data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm text-gray-500"
              >
                粉丝
                <span className="ml-1.5 text-[12px] opacity-60">
                  {followerCount}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 关注列表 */}
          <TabsContent value="following" className="mt-0 space-y-2">
            {followingList.length === 0 ? (
              <div className="bg-white rounded-[14px] p-8 shadow-sm flex flex-col items-center justify-center text-center">
                <Users className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-[15px] text-gray-400 font-medium">还没有关注任何人</p>
                <p className="text-[13px] text-gray-300 mt-1">去社区发现更多用户吧</p>
              </div>
            ) : (
              followingList.map(renderUserRow)
            )}
          </TabsContent>

          {/* 粉丝列表 */}
          <TabsContent value="followers" className="mt-0 space-y-2">
            {followerList.length === 0 ? (
              <div className="bg-white rounded-[14px] p-8 shadow-sm flex flex-col items-center justify-center text-center">
                <Users className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-[15px] text-gray-400 font-medium">还没有粉丝</p>
                <p className="text-[13px] text-gray-300 mt-1">多参与社区互动吧</p>
              </div>
            ) : (
              followerList.map(renderUserRow)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
