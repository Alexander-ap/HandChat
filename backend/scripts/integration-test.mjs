#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const BASE = process.env.INTEGRATION_BASE || 'http://localhost:3001/api';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EDGE_BASE = `${SUPABASE_URL}/functions/v1/make-server-481f4acb`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[integration-test] missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const password = 'Test123456!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signupAndLogin(label) {
  const email = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  const signupRes = await fetch(`${EDGE_BASE}/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      name: label,
    }),
  });
  const signupBody = await signupRes.json().catch(() => ({}));
  assert(signupRes.ok && signupBody?.success, `signup failed for ${label}: ${JSON.stringify(signupBody)}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assert(!error && data?.session?.access_token, `login failed for ${label}: ${error?.message || 'no session'}`);

  return {
    email,
    token: data.session.access_token,
    userId: data.user.id,
  };
}

async function api(token, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function apiOptional(path) {
  const response = await fetch(`${BASE}${path}`);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    steps: [],
    success: false,
  };
  const mark = (name, details = {}) => {
    report.steps.push({ name, ...details });
  };

  console.log('[integration-test] community flow start');

  const author = await signupAndLogin('author');
  const follower = await signupAndLogin('follower');

  const createPost = await api(author.token, '/posts', {
    method: 'POST',
    body: JSON.stringify({ content: `集成测试帖子 ${Date.now()}` }),
  });
  assert(createPost.response.status === 201, `create post expected 201, got ${createPost.response.status}`);
  const postId = createPost.body?.post?.id;
  assert(postId, 'missing post id');
  mark('create_post', { ok: true, postId });
  console.log(`  PASS create post ${postId}`);

  const listPosts = await apiOptional('/posts');
  assert(listPosts.response.status === 200, `list posts expected 200, got ${listPosts.response.status}`);
  assert((listPosts.body?.posts || []).some((item) => item.id === postId), 'post not found in list');
  mark('list_posts', { ok: true });
  console.log('  PASS list posts contains new post');

  const addComment = await api(author.token, `/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: '第一条评论' }),
  });
  assert(addComment.response.status === 201, `add comment expected 201, got ${addComment.response.status}`);
  mark('add_comment', { ok: true });
  console.log('  PASS add comment');

  const editPost = await api(author.token, `/posts/${postId}`, {
    method: 'PUT',
    body: JSON.stringify({ content: '编辑后的测试帖子内容' }),
  });
  assert(editPost.response.status === 200, `edit post expected 200, got ${editPost.response.status}`);
  assert(editPost.body?.post?.content === '编辑后的测试帖子内容', 'edited post content mismatch');
  mark('edit_post', { ok: true });
  console.log('  PASS edit post');

  const blockedPost = await api(author.token, '/posts', {
    method: 'POST',
    body: JSON.stringify({ content: '这是一个诈骗推广内容' }),
  });
  assert(blockedPost.response.status === 422, `blocked post expected 422, got ${blockedPost.response.status}`);
  mark('post_moderation', { ok: true, status: blockedPost.response.status });
  console.log('  PASS post moderation');

  const listComments = await apiOptional(`/posts/${postId}/comments`);
  assert(listComments.response.status === 200, `get comments expected 200, got ${listComments.response.status}`);
  assert((listComments.body?.comments || []).length >= 1, 'comment list empty');
  mark('list_comments', { ok: true });
  console.log('  PASS list comments');

  const blockedComment = await api(author.token, `/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: '办证开户链接点击这里' }),
  });
  assert(blockedComment.response.status === 422, `blocked comment expected 422, got ${blockedComment.response.status}`);
  mark('comment_moderation', { ok: true, status: blockedComment.response.status });
  console.log('  PASS comment moderation');

  const followAuthor = await api(follower.token, `/user/${author.userId}/follow`, {
    method: 'POST',
  });
  assert(followAuthor.response.status === 200 && followAuthor.body?.following === true, 'follow author failed');
  mark('follow_author', { ok: true });
  console.log('  PASS follow author');

  const followingFeed = await api(follower.token, '/posts?feed=following');
  assert(followingFeed.response.status === 200, `following feed expected 200, got ${followingFeed.response.status}`);
  assert((followingFeed.body?.posts || []).some((item) => item.id === postId), 'post not found in following feed');
  mark('following_feed', { ok: true });
  console.log('  PASS following feed');

  const bookmark = await api(follower.token, `/posts/${postId}/bookmark`, {
    method: 'POST',
  });
  assert(bookmark.response.status === 200 && bookmark.body?.bookmarked === true, 'bookmark failed');
  mark('bookmark_post', { ok: true });
  console.log('  PASS bookmark post');

  const bookmarks = await api(follower.token, '/user/bookmarks');
  assert(bookmarks.response.status === 200, `bookmarks expected 200, got ${bookmarks.response.status}`);
  assert((bookmarks.body?.posts || []).some((item) => item.id === postId), 'post not found in bookmarks');
  mark('list_bookmarks', { ok: true });
  console.log('  PASS list bookmarks');

  const firstLike = await api(follower.token, `/posts/${postId}/like`, {
    method: 'POST',
  });
  assert(firstLike.response.status === 200 && firstLike.body?.liked === true, 'first like failed');
  const secondLike = await api(follower.token, `/posts/${postId}/like`, {
    method: 'POST',
  });
  assert(secondLike.response.status === 200 && secondLike.body?.liked === false, 'second like toggle failed');
  mark('like_toggle', { ok: true });
  console.log('  PASS like toggle');

  const followerList = await apiOptional(`/user/${author.userId}/followers`);
  assert(followerList.response.status === 200, `followers list expected 200, got ${followerList.response.status}`);
  assert((followerList.body?.users || []).some((item) => item.userId === follower.userId), 'follower not found in list');
  mark('followers_list', { ok: true });
  console.log('  PASS followers list');

  const followingList = await apiOptional(`/user/${follower.userId}/following`);
  assert(followingList.response.status === 200, `following list expected 200, got ${followingList.response.status}`);
  assert((followingList.body?.users || []).some((item) => item.userId === author.userId), 'following not found in list');
  mark('following_list', { ok: true });
  console.log('  PASS following list');

  const invalidDelete = await api(follower.token, `/posts/${postId}`, {
    method: 'DELETE',
  });
  assert(invalidDelete.response.status === 404, `non-owner delete should be 404, got ${invalidDelete.response.status}`);
  mark('delete_permission', { ok: true });
  console.log('  PASS delete permission');

  const deletePost = await api(author.token, `/posts/${postId}`, {
    method: 'DELETE',
  });
  assert(deletePost.response.status === 200, `owner delete expected 200, got ${deletePost.response.status}`);
  mark('owner_delete', { ok: true });
  console.log('  PASS owner delete');

  report.success = true;
  report.finishedAt = new Date().toISOString();
  writeFileSync('integration-report.json', JSON.stringify(report, null, 2));
  console.log('[integration-test] community flow passed');
}

run().catch((error) => {
  const failedReport = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    success: false,
    error: error.message,
  };
  writeFileSync('integration-report.json', JSON.stringify(failedReport, null, 2));
  console.error('[integration-test] failed:', error.message);
  process.exit(1);
});
