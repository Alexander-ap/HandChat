import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ExternalLink, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
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

interface ManagedComment {
  id: string;
  content: string;
  postId: string;
  timeAgo: string;
  createdAt?: string;
  post: {
    id: string;
    content: string;
    comments: number;
    likes: number;
    timeAgo: string;
  };
}

export default function MyCommentsPage() {
  const navigate = useNavigate();
  const [comments, setComments] = useState<ManagedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ManagedComment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await userApi.getMyComments();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (error: any) {
      toast.error(error?.message || "加载评论失败");
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadComments();
  }, []);

  const locateComment = (comment: ManagedComment) => {
    navigate(`/community/post/${comment.postId}#comment-${comment.id}`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await postsApi.deleteComment(pendingDelete.postId, pendingDelete.id);
      setComments((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      toast.success("评论已删除");
      setPendingDelete(null);
    } catch (error: any) {
      toast.error(error?.message || "删除失败");
    } finally {
      setDeletingId(null);
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
            <h1 className="text-[20px] font-semibold text-[var(--md-sys-color-on-surface)]">我的评论</h1>
            <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">定位和管理已发布评论</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadComments()}
            className="h-10 w-10 rounded-full text-[var(--md-sys-color-on-surface-variant)]"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-4">
        {loading ? (
          <div className="app-panel rounded-[24px] p-8 text-center text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
            正在加载评论...
          </div>
        ) : comments.length === 0 ? (
          <div className="app-soft-card rounded-[24px] p-10 text-center">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-[var(--md-sys-color-on-surface-variant)]/45" />
            <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">还没有发布过评论</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="app-panel rounded-[22px] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{comment.timeAgo}</span>
                <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-sys-color-on-tertiary-container)]">
                  评论
                </span>
              </div>
              <p className="rounded-[18px] bg-[var(--md-sys-color-surface-container-high)] px-4 py-3 text-[15px] leading-7 text-[var(--md-sys-color-on-surface)]">
                {comment.content}
              </p>
              <button
                type="button"
                onClick={() => locateComment(comment)}
                className="mt-3 block w-full rounded-[18px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-4 py-3 text-left active:bg-black/5"
              >
                <p className="mb-1 text-[12px] font-medium text-[var(--md-sys-color-primary)]">所在帖子</p>
                <p className="line-clamp-2 text-[13px] leading-6 text-[var(--md-sys-color-on-surface-variant)]">
                  {comment.post?.content || "帖子内容为空"}
                </p>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  onClick={() => locateComment(comment)}
                  className="h-10 rounded-[14px] text-[13px] text-[var(--md-sys-color-primary)]"
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  定位
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPendingDelete(comment)}
                  disabled={deletingId === comment.id}
                  className="h-10 rounded-[14px] text-[13px] text-[var(--md-sys-color-error)]"
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
            <AlertDialogTitle>删除这条评论？</AlertDialogTitle>
            <AlertDialogDescription>删除后，这条评论会从对应帖子下移除。</AlertDialogDescription>
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
