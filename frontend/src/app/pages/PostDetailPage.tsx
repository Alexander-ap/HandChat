import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Bookmark, Heart, MessageCircle, RefreshCw, Share2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { postsApi } from "../lib/api";

interface PostAuthor {
  name: string;
  avatar: string;
  verified: boolean;
}

interface PostDetailState {
  id: string;
  author: PostAuthor;
  content: string;
  images?: string[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isBookmarked: boolean;
  timeAgo: string;
}

interface PostComment {
  id: string;
  authorName: string;
  content: string;
  timeAgo: string;
}

function formatTimeAgo(isoString?: string) {
  if (!isoString) return "刚刚";

  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(isoString).toLocaleDateString();
}

function normalizePost(item: any): PostDetailState {
  const rawAuthor = item?.author;
  const author =
    typeof rawAuthor === "string"
      ? { name: rawAuthor || "匿名用户", avatar: item?.avatar || "", verified: false }
      : {
          name: rawAuthor?.name || "匿名用户",
          avatar: rawAuthor?.avatar || item?.avatar || "",
          verified: Boolean(rawAuthor?.verified),
        };

  return {
    id: item?.id || "",
    author,
    content: item?.content || item?.title || "",
    images: Array.isArray(item?.images) ? item.images : [],
    likes: item?.likes || 0,
    comments: item?.comments || item?.commentCount || 0,
    shares: item?.shares || 0,
    isLiked: Boolean(item?.isLiked),
    isBookmarked: Boolean(item?.isBookmarked),
    timeAgo: item?.timeAgo || formatTimeAgo(item?.createdAt),
  };
}

export default function PostDetailPage() {
  const navigate = useNavigate();
  const { postId = "" } = useParams();
  const location = useLocation();
  const statePost = (location.state as { post?: PostDetailState } | null)?.post || null;

  const [post, setPost] = useState<PostDetailState | null>(statePost);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const title = useMemo(() => (post?.content ? post.content.slice(0, 18) : "帖子详情"), [post]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!postId) {
        setError("帖子不存在");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const [postData, commentsData] = await Promise.all([
          postsApi.getById(postId),
          postsApi.getComments(postId),
        ]);

        if (!active) return;

        setPost(normalizePost(postData));
        setComments(
          (commentsData.comments || []).map((item: any) => ({
            id: item.id || "",
            authorName: item.author?.name || item.authorName || item.authorId || "用户",
            content: item.content || "",
            timeAgo: formatTimeAgo(item.createdAt),
          }))
        );
      } catch (err: any) {
        if (!active) return;
        setError(err.message || "帖子加载失败");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--app-background, #F2F2F7)" }}>
      <div className="bg-white/80 backdrop-blur-xl px-4 pt-12 pb-3 shadow-sm sticky top-0 z-50 border-b border-black/[0.04]">
        <div className="w-full max-w-2xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/community")}
            className="h-10 w-10 rounded-2xl bg-white/75 text-slate-700 shadow-sm hover:bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-slate-900 truncate">帖子详情</h1>
            <p className="text-[13px] text-slate-500 truncate">{title}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.reload()}
            className="ml-auto h-10 w-10 rounded-2xl bg-white/75 text-slate-500 shadow-sm hover:bg-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 pt-4 w-full max-w-2xl mx-auto space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-[20px] p-8 shadow-sm text-center text-slate-400 text-[14px]">
            正在加载帖子详情...
          </div>
        ) : error ? (
          <div className="bg-white rounded-[20px] p-8 shadow-sm text-center">
            <p className="text-[15px] font-medium text-slate-800">{error}</p>
            <Button
              onClick={() => navigate("/community")}
              className="mt-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white"
            >
              返回社区
            </Button>
          </div>
        ) : post ? (
          <>
            <div className="bg-white rounded-[20px] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-white/80">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="w-11 h-11">
                  <AvatarImage src={post.author.avatar} />
                  <AvatarFallback className="bg-blue-50 text-blue-600 font-semibold">
                    {post.author.name?.[0] || "匿"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{post.author.name}</p>
                  <p className="text-[12px] text-slate-400">{post.timeAgo}</p>
                </div>
              </div>

              <p className="text-[15px] leading-7 text-slate-800 whitespace-pre-wrap">{post.content}</p>

              {post.images && post.images.length > 0 && (
                <div className={`mt-4 rounded-[16px] overflow-hidden ${post.images.length > 1 ? "grid grid-cols-2 gap-1" : ""}`}>
                  {post.images.slice(0, 4).map((img, index) => (
                    <img
                      key={`${img}-${index}`}
                      src={img}
                      alt={`post-${index + 1}`}
                      className="w-full h-44 object-cover bg-slate-100"
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-4 gap-2 text-slate-500">
                <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-50 py-2 text-[13px] font-medium">
                  <Heart className="w-4 h-4" />
                  <span>{post.likes}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-50 py-2 text-[13px] font-medium">
                  <MessageCircle className="w-4 h-4" />
                  <span>{post.comments}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-50 py-2 text-[13px] font-medium">
                  <Share2 className="w-4 h-4" />
                  <span>{post.shares}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-50 py-2 text-[13px] font-medium">
                  <Bookmark className="w-4 h-4" />
                  <span>{post.isBookmarked ? "已收藏" : "未收藏"}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[20px] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[17px] font-semibold text-slate-900">评论列表</h2>
                <span className="text-[13px] text-slate-400">{comments.length} 条</span>
              </div>

              {comments.length === 0 ? (
                <div className="rounded-[16px] bg-slate-50 py-10 text-center">
                  <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-[14px] text-slate-400">暂无评论，快去社区参与互动吧</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-[16px] bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[14px] font-medium text-slate-900 truncate">{comment.authorName}</p>
                        <span className="text-[12px] text-slate-400 flex-shrink-0">{comment.timeAgo}</span>
                      </div>
                      <p className="mt-2 text-[14px] leading-6 text-slate-700 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
