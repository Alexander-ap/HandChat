/**
 * 社区页面
 * 
 * 功能: 帖子浏览、发帖(支持图片)、点赞、收藏、评论
 */

import { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { Plus, Heart, MessageCircle, Share2, Bookmark, Send, X, Image as ImageIcon, ChevronDown } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { toast } from "sonner";
import { PageStateContext } from "../components/Root";
import { motion } from "motion/react";
import { postsApi, uploadApi, userApi } from "../lib/api";
import { supabase } from "../lib/supabase";

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
}

/** 评论数据结构 */
interface Comment {
  id: string;
  author: { name: string; avatar: string };
  content: string;
  likes: number;
  timeAgo: string;
}

export default function CommunityPage() {
  const { getPageState, setPageState } = useOutletContext<PageStateContext>();
  const savedState = getPageState('community') || {};
  const navigate = useNavigate();

  const [posts, setPosts] = useState<Post[]>(savedState.posts || []);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(savedState.activeTab || "recommended");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 评论相关
  const [showComments, setShowComments] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  /** 获取帖子列表 */
  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const data = await postsApi.getAll();
      if (Array.isArray(data)) {
        const mapped = data.map((item: any) => ({
          id: item.id || '',
          author: {
            name: item.author || '用户',
            avatar: item.avatar || '',
            verified: false
          },
          content: item.content || item.title || '',
          images: item.images || [],
          likes: item.likes || 0,
          comments: item.commentCount || item.comments?.length || 0,
          shares: 0,
          isLiked: false,
          isBookmarked: false,
          timeAgo: formatTimeAgo(item.createdAt),
        }))
        setPosts(mapped)
      }
    } catch (error: any) {
      console.error("[社区] 获取帖子失败:", error.message || error)
      toast.error("加载帖子失败，请检查网络连接")
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, []);

  useEffect(() => {
    setPageState('community', { posts, activeTab });
  }, [posts, activeTab, setPageState]);

  /** 点赞 */
  const handleLike = async (postId: string) => {
    // 先做乐观UI更新
    setPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
        : post
    ));
    try { 
      await postsApi.like(postId); 
    } catch (e: any) { 
      // 回滚乐观更新
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
          : post
      ));
      if (e.message?.includes("登录") || e.message?.includes("认证")) {
        toast.error("登录状态已过期，请重新登录");
        navigate("/login");
      } else {
        toast.error("操作失败: " + e.message);
      }
    }
  };

  /** 收藏 */
  const handleBookmark = async (postId: string) => {
    // 先做乐观UI更新
    setPosts(prev => prev.map(post =>
      post.id === postId ? { ...post, isBookmarked: !post.isBookmarked } : post
    ));
    try { 
      await postsApi.bookmark(postId); 
    } catch (e: any) { 
      // 回滚乐观更新
      setPosts(prev => prev.map(post =>
        post.id === postId ? { ...post, isBookmarked: !post.isBookmarked } : post
      ));
      if (e.message?.includes("登录") || e.message?.includes("认证")) {
        toast.error("登录状态已过期，请重新登录");
        navigate("/login");
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
      const data = await postsApi.addComment(selectedPostId, newComment.trim());
      if (data.id) {
        const comment = {
          id: data.id,
          author: { name: '我', avatar: '' },
          content: data.content,
          likes: 0,
          timeAgo: '刚刚',
        }
        setComments(prev => [comment, ...prev])
        // 更新帖子评论数
        setPosts(prev => prev.map(p =>
          p.id === selectedPostId ? { ...p, comments: p.comments + 1 } : p
        ));
        setNewComment("");
        toast.success("评论已发布");
        await userApi.recordAction('comment');
      }
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
      setIsLoading(true);
      toast.info("正在上传图片...");
      // 将图片转为 base64 data URL 作为兜底方案
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setNewPostImages(prev => [...prev, dataUrl]);
        toast.success("图片已添加");
        setIsLoading(false);
      };
      reader.onerror = () => {
        toast.error("图片读取失败");
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error("图片处理失败");
      setIsLoading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** 发布帖子 */
  const handlePublishPost = async () => {
    if (!newPostContent.trim()) {
      toast.error("请输入内容");
      return;
    }
    setIsLoading(true);
    try {
      let userName = "我";
      let userAvatar = "";
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || "我";
        userAvatar = session?.user?.user_metadata?.avatar_url || "";
      } catch (e) {
        // 获取用户信息失败，使用默认值
      }
      
      try {
        const data = await postsApi.create({
          content: newPostContent,
          author: userName,
          avatar: userAvatar,
          images: newPostImages.length > 0 ? newPostImages : undefined,
        });
        
        if (data.id) {
          setPosts(prev => [{
            id: data.id,
            author: { name: userName, avatar: userAvatar, verified: false },
            content: data.content,
            likes: data.likes || 0,
            comments: 0,
            shares: 0,
            isLiked: false,
            isBookmarked: false,
            timeAgo: '刚刚',
          }, ...prev])
          setNewPostContent("")
          setNewPostImages([])
          setShowNewPost(false)
          toast.success("发布成功")
          try { await userApi.recordAction('post') } catch (e) { /* ignore */ }
          return
        }
      } catch (serverErr: any) {
        if (serverErr.message.includes("登录") || serverErr.message.includes("认证")) {
          toast.error("请先登录后再发帖");
          navigate("/login");
          return;
        }
        console.warn("[社区] 服务器发帖失败:", serverErr.message);
        toast.error("发布失败: " + serverErr.message);
        return;
      }
    } catch (error: any) {
      console.error("[社区] 发帖完全失败:", error);
      toast.error("发布失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--app-background, #F2F2F7)' }}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* 头部 */}
        <div className="bg-white/80 backdrop-blur-xl px-4 pt-12 pb-2.5 shadow-sm sticky top-0 z-10 border-b border-gray-100 flex justify-center">
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-2.5">
              <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">社区</h1>
              <Button
                onClick={() => setShowNewPost(true)}
                size="sm"
                className="bg-blue-500 hover:bg-blue-600 rounded-full h-9 px-4 text-[14px] font-medium leading-none shadow-[0_4px_14px_0_rgb(59,130,246,0.39)] active:scale-[0.98]"
              >
                <Plus className="size-4" />
                <span className="leading-none">发帖</span>
              </Button>
            </div>
            <TabsList className="w-full h-9 bg-gray-100/80 rounded-[10px] p-0.5 grid grid-cols-3">
              <TabsTrigger value="recommended" className="rounded-[8px] text-[13px] data-[state=active]:bg-white data-[state=active]:shadow-sm font-medium">推荐</TabsTrigger>
              <TabsTrigger value="following" className="rounded-[8px] text-[13px] data-[state=active]:bg-white data-[state=active]:shadow-sm font-medium">关注</TabsTrigger>
              <TabsTrigger value="bookmarks" className="rounded-[8px] text-[13px] data-[state=active]:bg-white data-[state=active]:shadow-sm font-medium">收藏</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="pb-6 px-4 w-full max-w-2xl mx-auto">
          <TabsContent value="recommended" className="mt-0">
            <PostList posts={posts} onLike={handleLike} onBookmark={handleBookmark} onComment={handleOpenComments} />
          </TabsContent>
          <TabsContent value="following" className="mt-0">
            <PostList posts={posts.filter(p => p.author?.verified)} onLike={handleLike} onBookmark={handleBookmark} onComment={handleOpenComments} />
          </TabsContent>
          <TabsContent value="bookmarks" className="mt-0">
            <PostList posts={posts.filter(p => p.isBookmarked)} onLike={handleLike} onBookmark={handleBookmark} onComment={handleOpenComments} />
          </TabsContent>
        </div>
      </Tabs>

      {/* 发帖弹窗 */}
      <Dialog open={showNewPost} onOpenChange={setShowNewPost}>
        <DialogContent className="max-w-lg rounded-[24px] p-6 bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold">发布新帖</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-500">分享你的想法和图片</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <Textarea
              placeholder="分享你的想法..."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="min-h-28 rounded-[14px] border-gray-200 resize-none text-[15px] bg-white focus:ring-2 focus:ring-blue-500/20"
            />
            
            {newPostImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {newPostImages.map((img, idx) => (
                  <div key={idx} className="relative flex-shrink-0 w-20 h-20 rounded-[12px] overflow-hidden group">
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
                className="h-10 px-3 rounded-[12px] text-blue-500 border-blue-200 hover:bg-blue-50 text-[14px]"
                disabled={isLoading}
              >
                <ImageIcon className="w-4 h-4 mr-1.5" />
                添加图片
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              
              <div className="flex gap-2 flex-1 ml-3">
                <Button onClick={() => setShowNewPost(false)} variant="outline" className="flex-1 h-10 rounded-[12px] text-[14px]" disabled={isLoading}>取消</Button>
                <Button onClick={handlePublishPost} disabled={isLoading} className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 rounded-[12px] text-[14px] font-medium shadow-md">
                  <Send className="w-4 h-4 mr-1.5" />
                  {isLoading ? '处理中...' : '发布'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 评论弹窗 */}
      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="max-w-lg rounded-[24px] p-0 bg-white border-0 shadow-2xl max-h-[80vh] flex flex-col">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100">
            <DialogTitle className="text-[17px] font-bold text-center">评论</DialogTitle>
            <DialogDescription className="sr-only">查看和发表评论</DialogDescription>
          </div>
          
          <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[200px]">
            {loadingComments ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-[14px]">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                暂无评论，来发表第一条吧
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarImage src={comment.author?.avatar} />
                      <AvatarFallback className="bg-gray-100 text-gray-500 text-[12px]">
                        {comment.author?.name?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-gray-900">{comment.author?.name}</span>
                        <span className="text-[12px] text-gray-400">{comment.timeAgo}</span>
                      </div>
                      <p className="text-[14px] text-gray-700 mt-0.5 leading-relaxed">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* 评论输入 */}
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmitComment()}
              placeholder="写评论..."
              className="flex-1 h-9 rounded-full bg-gray-100 px-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <Button
              onClick={handleSubmitComment}
              disabled={!newComment.trim()}
              size="sm"
              className="h-9 w-9 rounded-full bg-blue-500 hover:bg-blue-600 p-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 格式化时间 */
function formatTimeAgo(isoString: string): string {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(isoString).toLocaleDateString()
}

/** 帖子列表组件 */
function PostList({ posts, onLike, onBookmark, onComment }: {
  posts: Post[];
  onLike: (id: string) => void;
  onBookmark: (id: string) => void;
  onComment: (id: string) => void;
}) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <MessageCircle className="w-12 h-12 text-gray-300 mb-2" />
        <p className="text-gray-400 text-[14px]">暂无内容</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pt-2.5">
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
  const navigate = useNavigate();
  const author = typeof post.author === 'string' 
    ? { name: post.author, avatar: '', verified: false } 
    : (post.author || { name: '匿名', avatar: '', verified: false });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[16px] p-3.5 shadow-[0_1px_3px_rgb(0,0,0,0.04)] border border-gray-50"
    >
      {/* 作者 */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar className="w-9 h-9 border border-gray-100/50">
          <AvatarImage src={author.avatar} />
          <AvatarFallback className="bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 text-[13px] font-medium">
            {author.name?.[0] || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-[14px] text-gray-900">{author.name}</span>
            {author.verified && (
              <div className="w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <span className="text-[11px] text-gray-400">{post.timeAgo}</span>
        </div>
      </div>

      {/* 内容 */}
      <button
        type="button"
        onClick={() => navigate(`/community/posts/${post.id}`, { state: { post } })}
        className="w-full text-left"
      >
        <p className="text-[14px] text-gray-800 mb-2.5 leading-relaxed hover:text-gray-900 transition-colors">{post.content}</p>
      </button>

      {/* 图片 */}
      {post.images && post.images.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/community/posts/${post.id}`, { state: { post } })}
          className={`mb-2.5 w-full rounded-[12px] overflow-hidden ${post.images.length > 1 ? 'grid grid-cols-2 gap-0.5' : 'block'}`}
        >
          {post.images.slice(0, 4).map((img, i) => (
            <img key={i} src={img} alt="Post" className="w-full h-40 object-cover" />
          ))}
        </button>
      )}

      {/* 互动 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <Button variant="ghost" size="sm" onClick={() => onLike(post.id)}
          className={`gap-1 px-2 h-8 rounded-lg ${post.isLiked ? "text-red-500" : "text-gray-500"}`}>
          <Heart className={`w-4 h-4 ${post.isLiked ? "fill-current" : ""}`} strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.likes}</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onComment(post.id)}
          className="gap-1 px-2 text-gray-500 h-8 rounded-lg">
          <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.comments}</span>
        </Button>

        <Button variant="ghost" size="sm" className="gap-1 px-2 text-gray-500 h-8 rounded-lg">
          <Share2 className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[12px] font-medium">{post.shares}</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={() => onBookmark(post.id)}
          className={`px-2 h-8 rounded-lg ${post.isBookmarked ? "text-blue-500" : "text-gray-500"}`}>
          <Bookmark className={`w-4 h-4 ${post.isBookmarked ? "fill-current" : ""}`} strokeWidth={1.5} />
        </Button>
      </div>
    </motion.div>
  );
}
