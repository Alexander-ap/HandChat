/**
 * 社区页面
 * 
 * 功能: 帖子浏览、发帖(支持图片)、点赞、收藏、评论
 */

import { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { Plus, Heart, MessageCircle, Share2, Bookmark, Send, X, Image as ImageIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import { motion } from "motion/react";
import { postsApi, userApi, syncAuthToken } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";

/** 帖子数据结构 */
interface Post {
  id: string;
  author: { name: string; avatar: string; verified: boolean };
  content: string;
  images?: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isBookmarked: boolean;
  timeAgo: string;
  createdAt?: number;
  userId?: string;
}

/** 评论数据结构 */
interface Comment {
  id: string;
  author: { name: string; avatar: string };
  content: string;
  likes: number;
  timeAgo: string;
}

const COMMUNITY_LOCAL_POSTS_KEY = "community-local-posts";
const LOCAL_POST_TTL_MS = 24 * 60 * 60 * 1000;

function mergePostLists(primary: Post[], secondary: Post[]) {
  const merged = new Map<string, Post>();

  [...primary, ...secondary].forEach((post) => {
    if (!post?.id) return;
    if (!merged.has(post.id)) {
      merged.set(post.id, post);
      return;
    }
    merged.set(post.id, { ...merged.get(post.id)!, ...post });
  });

  return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function readLocalPosts(): Post[] {
  try {
    const raw = sessionStorage.getItem(COMMUNITY_LOCAL_POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Post => Boolean(item?.id));
  } catch {
    return [];
  }
}

function writeLocalPosts(posts: Post[]) {
  try {
    const cutoff = Date.now() - LOCAL_POST_TTL_MS;
    const nextPosts = posts.filter((post) => (post.createdAt || Date.now()) >= cutoff);
    sessionStorage.setItem(COMMUNITY_LOCAL_POSTS_KEY, JSON.stringify(nextPosts));
  } catch {
    // 忽略存储异常，避免影响主流程
  }
}

function upsertLocalPost(post: Post) {
  writeLocalPosts(mergePostLists([post], readLocalPosts()));
}

function reconcileLocalPosts(serverPosts: Post[]) {
  const serverIds = new Set(serverPosts.map((post) => post.id));
  writeLocalPosts(readLocalPosts().filter((post) => !serverIds.has(post.id)));
}

export default function CommunityPage() {
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const savedState = getPageState('community') || {};
  const navigate = useNavigate();
  const { text } = useLanguage();
  const initialRecommendedPosts = mergePostLists(
    savedState.recommendedPosts || savedState.posts || [],
    readLocalPosts()
  );

  const [posts, setPosts] = useState<Post[]>(initialRecommendedPosts);
  const [followingPosts, setFollowingPosts] = useState<Post[]>(savedState.followingPosts || []);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>(savedState.bookmarkedPosts || []);
  const [followingLoaded, setFollowingLoaded] = useState(Boolean(savedState.followingLoaded));
  const [bookmarksLoaded, setBookmarksLoaded] = useState(Boolean(savedState.bookmarksLoaded));
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(savedState.activeTab || "recommended");
  const [loadingRecommended, setLoadingRecommended] = useState(false);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [followingError, setFollowingError] = useState<string | null>(null);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishingPost, setPublishingPost] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 评论相关
  const [showComments, setShowComments] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  const updatePostCollections = (updater: (list: Post[]) => Post[]) => {
    setPosts((prev) => updater(prev));
    setFollowingPosts((prev) => updater(prev));
    setBookmarkedPosts((prev) => updater(prev));
  };

  const ensureCommunitySession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error(text("请先登录后再操作", "Please sign in to continue"));
    }
    syncAuthToken(session.access_token);
    return session;
  };

  /** 获取帖子列表 */
  const fetchPosts = async (feed: "recommended" | "following" = "recommended") => {
    if (feed === "following") setLoadingFollowing(true);
    else setLoadingRecommended(true);
    if (feed === "following") setFollowingError(null);
    else setRecommendedError(null);
    try {
      const data = feed === "following"
        ? await postsApi.getAll("following")
        : await postsApi.getAll();

      const nextPosts = data.posts && Array.isArray(data.posts) ? data.posts : [];
      if (data.posts && Array.isArray(data.posts)) {
        if (feed === "following") {
          setFollowingPosts(nextPosts);
          setFollowingLoaded(true);
          setFollowingError(null);
        } else {
          const mergedPosts = mergePostLists(nextPosts, readLocalPosts());
          setPosts(mergedPosts);
          reconcileLocalPosts(nextPosts);
          setRecommendedError(null);
        }
      } else {
        if (feed === "following") {
          setFollowingLoaded(true);
          setFollowingError(null);
        } else {
          setRecommendedError(null);
        }
      }
    } catch (error: any) {
      const message = error?.message || text("加载失败，请稍后重试", "Failed to load. Please try again.");
      const isAuthError = error?.message?.includes("登录") || error?.message?.includes("认证");
      if (isAuthError) {
        console.warn("[社区] 获取帖子失败:", error.message || error);
      } else {
        console.error("[社区] 获取帖子失败:", error.message || error);
      }
      if (feed === "following") {
        setFollowingLoaded(true);
        setFollowingError(isAuthError
          ? text("登录后即可查看关注动态", "Sign in to view following feed")
          : message);
        if (isAuthError) {
          toast.info(text("登录后即可查看关注动态", "Sign in to view following feed"));
        } else {
          toast.error(message);
        }
      } else {
        setRecommendedError(message);
        toast.error(message);
      }
    } finally {
      if (feed === "following") setLoadingFollowing(false);
      else setLoadingRecommended(false);
    }
  };

  const fetchBookmarks = async () => {
    setLoadingBookmarks(true);
    setBookmarksError(null);
    try {
      await ensureCommunitySession();
      const data = await userApi.getBookmarks();
      const nextPosts = Array.isArray(data?.posts) ? data.posts : [];
      setBookmarkedPosts(nextPosts);
      setBookmarksLoaded(true);
    } catch (error: any) {
      const message = error?.message || text("加载失败，请稍后重试", "Failed to load. Please try again.");
      setBookmarksError(message);
      setBookmarksLoaded(true);
      toast.error(message);
    } finally {
      setLoadingBookmarks(false);
    }
  };

  useEffect(() => { void fetchPosts(); }, []);

  useEffect(() => {
    if (activeTab === "following" && !followingLoaded) {
      void fetchPosts("following");
    }
    if (activeTab === "bookmarks" && !bookmarksLoaded) {
      void fetchBookmarks();
    }
  }, [activeTab, followingLoaded, bookmarksLoaded]);

  useEffect(() => {
    setPageState('community', {
      posts,
      recommendedPosts: posts,
      followingPosts,
      bookmarkedPosts,
      activeTab,
      followingLoaded,
      bookmarksLoaded,
    });
  }, [posts, followingPosts, bookmarkedPosts, activeTab, followingLoaded, bookmarksLoaded, setPageState]);

  /** 点赞 */
  const handleLike = async (postId: string) => {
    try {
      await ensureCommunitySession();
    } catch (e: any) {
      toast.error(e.message || text("请先登录后再操作", "Please sign in to continue"));
      return;
    }
    // 先做乐观UI更新
    updatePostCollections(prev => prev.map(post =>
      post.id === postId
        ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
        : post
    ));
    try { 
      await postsApi.like(postId); 
    } catch (e: any) { 
      // 回滚乐观更新
      updatePostCollections(prev => prev.map(post =>
        post.id === postId
          ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
          : post
      ));
      if (e.message?.includes("登录") || e.message?.includes("认证")) {
        toast.error(text("请先登录后再操作", "Please sign in to continue"));
      } else {
        toast.error("操作失败: " + e.message);
      }
    }
  };

  /** 收藏 */
  const handleBookmark = async (postId: string) => {
    const targetPost = [...posts, ...followingPosts, ...bookmarkedPosts].find((post) => post.id === postId);
    try {
      await ensureCommunitySession();
    } catch (e: any) {
      toast.error(e.message || text("请先登录后再操作", "Please sign in to continue"));
      return;
    }
    // 先做乐观UI更新
    updatePostCollections(prev => prev.map(post =>
      post.id === postId ? { ...post, isBookmarked: !post.isBookmarked } : post
    ));
    try { 
      await postsApi.bookmark(postId); 
      if (bookmarksLoaded) {
        if (targetPost?.isBookmarked) {
          setBookmarkedPosts((prev) => prev.filter((post) => post.id !== postId));
        } else if (targetPost) {
          setBookmarkedPosts((prev) => mergePostLists([{ ...targetPost, isBookmarked: true }], prev));
        } else {
          void fetchBookmarks();
        }
      }
    } catch (e: any) { 
      // 回滚乐观更新
      updatePostCollections(prev => prev.map(post =>
        post.id === postId ? { ...post, isBookmarked: !post.isBookmarked } : post
      ));
      if (e.message?.includes("登录") || e.message?.includes("认证")) {
        toast.error(text("请先登录后再操作", "Please sign in to continue"));
      } else {
        toast.error("操作失败: " + e.message);
      }
    }
  };

  /** 打开评论 */
  const handleOpenComments = async (postId: string) => {
    setSelectedPostId(postId);
    setShowComments(true);
    setLoadingComments(true);
    try {
      const data = await postsApi.getComments(postId);
      setComments(data.comments || []);
    } catch (e) {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  /** 发表评论 */
  const handleSubmitComment = async () => {
    if (!newComment.trim() || !selectedPostId) return;
    try {
      await ensureCommunitySession();
      const data = await postsApi.addComment(selectedPostId, newComment.trim());
      const nextComment = data?.comment || (data?.id ? data : null);
      if (nextComment) {
        setComments(prev => [nextComment, ...prev]);
        // 更新帖子评论数
        updatePostCollections(prev => prev.map(p =>
          p.id === selectedPostId ? { ...p, comments: p.comments + 1 } : p
        ));
        setNewComment("");
        toast.success("评论已发布");
        try {
          await userApi.recordAction('comment');
        } catch (recordError) {
          console.warn("[社区] 评论积分记录失败:", recordError);
        }
        return;
      }
      throw new Error("评论返回结果异常");
    } catch (e: any) {
      if (e.message?.includes("登录") || e.message?.includes("认证")) {
        toast.error("请先登录后再评论");
      } else {
        toast.error(e.message || "评论失败");
      }
    }
  };

  /** 上传图片 */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      toast.info(text("正在添加图片...", "Adding image..."));
      // 将图片转为 base64 data URL 作为兜底方案
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setNewPostImages(prev => [...prev, dataUrl]);
        toast.success(text("图片已添加", "Image added"));
        setUploadingImage(false);
      };
      reader.onerror = () => {
        toast.error(text("图片读取失败", "Failed to read image"));
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(text("图片处理失败", "Failed to process image"));
      setUploadingImage(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** 发布帖子 */
  const handlePublishPost = async () => {
    if (!newPostContent.trim()) {
      toast.error(text("请输入内容", "Please enter content"));
      return;
    }
    setPublishingPost(true);
    try {
      let userName = "我";
      let userAvatar = "";
      try {
        const session = await ensureCommunitySession();
        userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || "我";
        userAvatar = session?.user?.user_metadata?.avatar_url || "";
      } catch (e) {
        const message = (e as any)?.message;
        if (message?.includes("登录")) {
          toast.error(message);
          return;
        }
      }
      
      try {
        const data = await postsApi.create({
          content: newPostContent,
          author: userName,
          avatar: userAvatar,
          images: newPostImages.length > 0 ? newPostImages : undefined,
        });
        
        if (data.success && data.post) {
          const nextPost = {
            ...data.post,
            createdAt: data.post.createdAt || Date.now(),
          };
          upsertLocalPost(nextPost);
          setPosts(prev => mergePostLists([nextPost], prev));
          setNewPostContent("");
          setNewPostImages([]);
          setShowNewPost(false);
          toast.success(text("发布成功", "Posted"));
          try { await userApi.recordAction('post'); } catch (e) { /* ignore */ }
          return;
        }
      } catch (serverErr: any) {
        if (serverErr.message.includes("登录") || serverErr.message.includes("认证")) {
          toast.error(text("请先登录后再发帖", "Please sign in to post"));
          return;
        }
        console.warn("[社区] 服务器发帖失败:", serverErr.message);
        toast.error(text("发布失败: ", "Failed to post: ") + serverErr.message);
        return;
      }
    } catch (error: any) {
      console.error("[社区] 发帖完全失败:", error);
      toast.error(text("发布失败，请重试", "Failed to post. Please try again."));
    } finally {
      setPublishingPost(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-[var(--md-sys-color-background)]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* 头部 TopAppBar MD3 Style */}
        <div className="sticky top-0 z-10 bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-[var(--md-sys-elevation-level1)] px-4 pt-11 pb-3">
          <div className="w-full max-w-2xl mx-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[var(--md-sys-typescale-title-large-size)] font-medium leading-8 tracking-normal">
                  {text("社区", "Community")}
                </h1>
                <p className="mt-1 text-[12px] leading-4 text-[var(--md-sys-color-on-surface-variant)]">
                  {text("浏览动态、交流经验、发布分享", "Browse posts, connect, and share updates")}
                </p>
              </div>
              <Button
                onClick={() => setShowNewPost(true)}
                className="h-10 shrink-0 rounded-full px-4 bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] hover:bg-[var(--md-sys-color-primary-container)]/90 shadow-none"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                <span className="text-[var(--md-sys-typescale-label-large-size)] font-medium">{text("发帖", "Post")}</span>
              </Button>
            </div>
            <TabsList className="flex h-11 w-full justify-start gap-1 rounded-full bg-[var(--md-sys-color-surface-container-low)] p-1">
              <TabsTrigger 
                value="recommended" 
                className="relative h-full rounded-full border-none bg-transparent px-4 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)] data-[state=active]:bg-[var(--md-sys-color-secondary-container)] data-[state=active]:text-[var(--md-sys-color-on-secondary-container)] data-[state=active]:shadow-none"
              >
                {text("推荐", "Recommended")}
              </TabsTrigger>
              <TabsTrigger 
                value="following" 
                className="relative h-full rounded-full border-none bg-transparent px-4 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)] data-[state=active]:bg-[var(--md-sys-color-secondary-container)] data-[state=active]:text-[var(--md-sys-color-on-secondary-container)] data-[state=active]:shadow-none"
              >
                {text("关注", "Following")}
              </TabsTrigger>
              <TabsTrigger 
                value="bookmarks" 
                className="relative h-full rounded-full border-none bg-transparent px-4 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)] data-[state=active]:bg-[var(--md-sys-color-secondary-container)] data-[state=active]:text-[var(--md-sys-color-on-secondary-container)] data-[state=active]:shadow-none"
              >
                {text("收藏", "Saved")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4">
          <TabsContent value="recommended" className="mt-0">
            <PostList
              posts={posts}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onComment={handleOpenComments}
              isLoading={loadingRecommended}
              errorText={recommendedError}
              onRetry={() => void fetchPosts("recommended")}
              emptyText={text("暂无内容", "No posts yet")}
            />
          </TabsContent>
          <TabsContent value="following" className="mt-0">
            <PostList
              posts={followingPosts}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onComment={handleOpenComments}
              isLoading={loadingFollowing}
              errorText={followingError}
              onRetry={() => void fetchPosts("following")}
              emptyText={text("暂时还没有关注动态", "No following feed yet")}
            />
          </TabsContent>
          <TabsContent value="bookmarks" className="mt-0">
            <PostList
              posts={bookmarkedPosts}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onComment={handleOpenComments}
              isLoading={loadingBookmarks}
              errorText={bookmarksError}
              onRetry={() => void fetchBookmarks()}
              emptyText={text("暂无收藏内容", "No saved posts")}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* 发帖弹窗 */}
      <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
        <DialogContent className="max-w-lg rounded-[28px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-6 shadow-[var(--md-sys-elevation-level3)]">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold text-[var(--md-sys-color-on-surface)]">{text("发布新帖", "Create a Post")}</DialogTitle>
            <DialogDescription className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">{text("分享你的想法和图片", "Share your thoughts and images")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <Textarea
              placeholder={text("分享你的想法...", "Share what you are thinking...")}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="min-h-28 resize-none rounded-[18px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[15px]"
            />
            
            {newPostImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {newPostImages.map((img, idx) => (
                  <div key={idx} className="group relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-[16px] border border-[var(--md-sys-color-outline-variant)] shadow-[var(--md-sys-elevation-level1)]">
                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setNewPostImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-black/50 p-0.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="outline" 
                className="h-10 rounded-[14px] border-[var(--md-sys-color-outline-variant)] px-3 text-[14px] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/50"
                disabled={uploadingImage || publishingPost}
              >
                <ImageIcon className="w-4 h-4 mr-1.5" />
                {text("添加图片", "Add Images")}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              
              <div className="flex gap-2 flex-1 ml-3">
                <Button
                  onClick={() => setShowNewPost(false)}
                  variant="outline"
                  className="h-10 flex-1 rounded-[14px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[14px]"
                  disabled={uploadingImage || publishingPost}
                >
                  {text("取消", "Cancel")}
                </Button>
                <Button
                  onClick={handlePublishPost}
                  disabled={uploadingImage || publishingPost || !newPostContent.trim()}
                  className="h-10 flex-1 rounded-[14px] bg-[var(--md-sys-color-primary)] text-[14px] font-medium text-[var(--md-sys-color-on-primary)]"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {publishingPost ? text("处理中...", "Posting...") : text("发布", "Post")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 评论弹窗 */}
      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="flex max-h-[80vh] max-w-lg flex-col rounded-[28px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-0 shadow-[var(--md-sys-elevation-level3)]">
          <div className="border-b border-[var(--md-sys-color-outline-variant)] px-5 pt-5 pb-3">
            <DialogTitle className="text-center text-[17px] font-semibold text-[var(--md-sys-color-on-surface)]">评论</DialogTitle>
            <DialogDescription className="sr-only">查看和发表评论</DialogDescription>
          </div>
          
          <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[200px]">
            {loadingComments ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-[var(--md-sys-color-primary)]" />
              </div>
            ) : comments.length === 0 ? (
              <div className="rounded-[20px] bg-[var(--md-sys-color-surface)] py-10 text-center text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
                <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                暂无评论，来发表第一条吧
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0 border border-[var(--md-sys-color-outline-variant)]">
                      <AvatarImage src={comment.author?.avatar} />
                      <AvatarFallback className="bg-[var(--md-sys-color-primary-container)] text-[12px] text-[var(--md-sys-color-on-primary-container)]">
                        {comment.author?.name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{comment.author?.name}</span>
                        <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{comment.timeAgo}</span>
                      </div>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--md-sys-color-on-surface)]">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* 评论输入 */}
          <div className="flex gap-2 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-3">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmitComment()}
              placeholder="写评论..."
              className="h-10 flex-1 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 text-[14px] outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)]/20"
            />
            <Button
              onClick={handleSubmitComment}
              disabled={!newComment.trim()}
              size="sm"
              className="h-10 w-10 rounded-full bg-[var(--md-sys-color-primary)] p-0 text-[var(--md-sys-color-on-primary)] hover:bg-[var(--md-sys-color-primary)]/90"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostList({ posts, onLike, onBookmark, onComment, isLoading, emptyText, errorText, onRetry }: {
  posts: Post[];
  onLike: (id: string) => void;
  onBookmark: (id: string) => void;
  onComment: (id: string) => void;
  isLoading?: boolean;
  emptyText?: string;
  errorText?: string | null;
  onRetry?: () => void;
}) {
  if (posts.length === 0 && emptyText && emptyText.trim() === "") {
    emptyText = undefined;
  }

  if (posts.length === 0 && isLoading) {
    return (
      <div className="space-y-3 pt-1">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="app-panel rounded-[20px] p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--md-sys-color-outline-variant)]/70 pt-3">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0 && errorText) {
    return (
      <div className="app-soft-card flex flex-col items-center justify-center rounded-[24px] px-5 py-12 text-center">
        <MessageCircle className="mb-3 h-12 w-12 text-[var(--md-sys-color-error)]/70" />
        <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">
          {errorText}
        </p>
        <p className="mt-1 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          请检查网络或稍后重试
        </p>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="mt-4 rounded-full border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4"
          >
            重新加载
          </Button>
        )}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="app-soft-card flex flex-col items-center justify-center rounded-[24px] py-16">
        <MessageCircle className="mb-3 h-12 w-12 text-[var(--md-sys-color-on-surface-variant)]/50" />
        <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">{emptyText || "暂无内容"}</p>
      </div>
    );
  }

  return (
      <div className="space-y-3 pt-1">
      {posts.map(post => (
        <PostCard key={post.id} post={post} onLike={onLike} onBookmark={onBookmark} onComment={onComment} />
      ))}
    </div>
  );
}

/** 单条帖子卡片 */
function PostCard({ post, onLike, onBookmark, onComment }: {
  post: Post;
  onLike: (id: string) => void;
  onBookmark: (id: string) => void;
  onComment: (id: string) => void;
}) {
  const author = typeof post.author === 'string' 
    ? { name: post.author, avatar: '', verified: false } 
    : (post.author || { name: '匿名', avatar: '', verified: false });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="app-panel p-4 mb-3"
    >
      {/* 作者 */}
      <div className="mb-3 flex items-center gap-3">
        <Avatar className="h-10 w-10 border border-[var(--md-sys-color-outline-variant)]">
          <AvatarImage src={author.avatar} />
          <AvatarFallback className="bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-[14px] font-medium">
            {author.name?.[0] || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="font-medium text-[var(--md-sys-typescale-title-medium-size)] text-[var(--md-sys-color-on-surface)]">{author.name}</span>
            {author.verified && (
              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)]">
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{post.timeAgo}</span>
        </div>
      </div>

      {/* 内容 */}
      <p className="mb-3 text-[14px] leading-7 text-[var(--md-sys-color-on-surface)]">{post.content}</p>

      {/* 图片 */}
      {post.images && post.images.length > 0 && (
        <div className={`mb-2.5 overflow-hidden rounded-[16px] ${post.images.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}`}>
          {post.images.slice(0, 4).map((img, i) => (
            <img key={i} src={img} alt="Post" className="w-full h-40 object-cover" />
          ))}
        </div>
      )}

      {/* 互动 */}
      <div className="flex items-center justify-between border-t border-[var(--md-sys-color-outline-variant)]/70 pt-2.5">
        <Button variant="ghost" size="sm" onClick={() => onLike(post.id)}
          className={`h-8 gap-1 rounded-lg px-2 ${post.isLiked ? "text-red-500" : "text-[var(--md-sys-color-on-surface-variant)]"}`}>
          <Heart className={`w-4 h-4 ${post.isLiked ? "fill-current" : ""}`} strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.likes}</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onComment(post.id)}
          className="h-8 gap-1 rounded-lg px-2 text-[var(--md-sys-color-on-surface-variant)]">
          <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.comments}</span>
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 text-[var(--md-sys-color-on-surface-variant)]">
          <Share2 className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.shares}</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onBookmark(post.id)}
          className={`h-8 rounded-lg px-2 ${post.isBookmarked ? "text-[var(--md-sys-color-primary)]" : "text-[var(--md-sys-color-on-surface-variant)]"}`}>
          <Bookmark className={`w-4 h-4 ${post.isBookmarked ? "fill-current" : ""}`} strokeWidth={1.5} />
        </Button>
      </div>
    </motion.div>
  );
}
