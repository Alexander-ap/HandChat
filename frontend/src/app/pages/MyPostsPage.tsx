import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, MessageCircle, RefreshCw, Share2, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { postsApi, userApi } from "../lib/api";
import { toast } from "sonner";

interface ManagedPost {
  id: string;
  title?: string;
  content: string;
  likes: number;
  comments: number;
  shares?: number;
  timeAgo: string;
  createdAt?: string;
}

async function sharePost(post: ManagedPost) {
  const url = `${window.location.origin}/community/post/${post.id}`;
  const text = post.content || post.title || "HandChat 社区帖子";
  if (navigator.share) {
    await navigator.share({ title: "HandChat", text, url });
    return;
  }
  await navigator.clipboard.writeText(url);
}

export default function MyPostsPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<ManagedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedPost | null>(null);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await userApi.getMyPosts();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (error: any) {
      toast.error(error?.message || "加载帖子失败");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, []);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await postsApi.delete(pendingDelete.id);
      setPosts((prev) => prev.filter((post) => post.id !== pendingDelete.id));
      toast.success("帖子已删除");
      setPendingDelete(null);
    } catch (error: any) {
      toast.error(error?.message || "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const handleShare = async (post: ManagedPost) => {
    try {
      await sharePost(post);
      toast.success("分享链接已准备好");
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        toast.error("分享失败，请稍后重试");
      }
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-[var(--md-sys-color-background)]">
      <div className="app-topbar sticky top-0 z-50 bg-[var(--md-sys-color-surface)] px-4 pt-10 pb-3">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-full text-[var(--md-sys-color-primary)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold text-[var(--md-sys-color-on-surface)]">我的帖子</h1>
            <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">管理已发布内容</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadPosts()}
            className="h-10 w-10 rounded-full text-[var(--md-sys-color-on-surface-variant)]"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-4">
        {loading ? (
          <div className="app-panel rounded-[24px] p-8 text-center text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
            正在加载帖子...
          </div>
        ) : posts.length === 0 ? (
          <div className="app-soft-card rounded-[24px] p-10 text-center">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-[var(--md-sys-color-on-surface-variant)]/45" />
            <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">还没有发布过帖子</p>
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="app-panel rounded-[22px] p-4">
              <button
                type="button"
                onClick={() => navigate(`/community/post/${post.id}`, { state: { post } })}
                className="block w-full text-left"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{post.timeAgo}</span>
                  <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-sys-color-on-secondary-container)]">
                    {post.comments} 评论
                  </span>
                </div>
                <p className="line-clamp-3 text-[15px] leading-7 text-[var(--md-sys-color-on-surface)]">{post.content}</p>
              </button>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--md-sys-color-outline-variant)]/70 pt-3">
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/community/post/${post.id}`, { state: { post } })}
                  className="h-10 rounded-[14px] text-[13px] text-[var(--md-sys-color-on-surface-variant)]"
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  查看
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void handleShare(post)}
                  className="h-10 rounded-[14px] text-[13px] text-[var(--md-sys-color-on-surface-variant)]"
                >
                  <Share2 className="mr-1.5 h-4 w-4" />
                  转发
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPendingDelete(post)}
                  className="h-10 rounded-[14px] text-[13px] text-[var(--md-sys-color-error)]"
                  disabled={deletingId === post.id}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-[24px] bg-[var(--md-sys-color-surface)]">
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条帖子？</AlertDialogTitle>
            <AlertDialogDescription>删除后，帖子下的评论和收藏记录也会一起移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-full bg-[var(--md-sys-color-error)] text-white">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
