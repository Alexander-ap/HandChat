#!/usr/bin/env node

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const statements = [
  `
  CREATE TABLE IF NOT EXISTS "Post" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS "Comment" (
    "id" TEXT PRIMARY KEY,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS "Follow" (
    "id" TEXT PRIMARY KEY,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS "Bookmark" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS "Like" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS "UserProfile" (
    "userId" TEXT PRIMARY KEY,
    "nickname" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "notification" BOOLEAN NOT NULL DEFAULT true,
    "vibration" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "likes" INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "notification" BOOLEAN NOT NULL DEFAULT true;`,
  `ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "vibration" BOOLEAN NOT NULL DEFAULT true;`,
  `ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'zh-CN';`,
  `ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Comment_postId_fkey'
    ) THEN
      ALTER TABLE "Comment"
      ADD CONSTRAINT "Comment_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE;
    END IF;
  END $$;
  `,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Bookmark_postId_fkey'
    ) THEN
      ALTER TABLE "Bookmark"
      ADD CONSTRAINT "Bookmark_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE;
    END IF;
  END $$;
  `,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Like_postId_fkey'
    ) THEN
      ALTER TABLE "Like"
      ADD CONSTRAINT "Like_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE;
    END IF;
  END $$;
  `,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Follow_followerId_followingId_key'
    ) THEN
      ALTER TABLE "Follow"
      ADD CONSTRAINT "Follow_followerId_followingId_key"
      UNIQUE ("followerId", "followingId");
    END IF;
  END $$;
  `,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Bookmark_userId_postId_key'
    ) THEN
      ALTER TABLE "Bookmark"
      ADD CONSTRAINT "Bookmark_userId_postId_key"
      UNIQUE ("userId", "postId");
    END IF;
  END $$;
  `,
  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'Like_userId_postId_key'
    ) THEN
      ALTER TABLE "Like"
      ADD CONSTRAINT "Like_userId_postId_key"
      UNIQUE ("userId", "postId");
    END IF;
  END $$;
  `,
  `CREATE INDEX IF NOT EXISTS "Post_authorId_createdAt_idx" ON "Post" ("authorId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "Comment_postId_createdAt_idx" ON "Comment" ("postId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "Follow_followerId_idx" ON "Follow" ("followerId");`,
  `CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "Follow" ("followingId");`,
  `CREATE INDEX IF NOT EXISTS "Bookmark_userId_idx" ON "Bookmark" ("userId");`,
  `CREATE INDEX IF NOT EXISTS "Bookmark_postId_idx" ON "Bookmark" ("postId");`,
  `CREATE INDEX IF NOT EXISTS "Like_userId_idx" ON "Like" ("userId");`,
  `CREATE INDEX IF NOT EXISTS "Like_postId_idx" ON "Like" ("postId");`,
]

async function main() {
  console.log('[ensure-community-schema] start')
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log('[ensure-community-schema] done')
}

main()
  .catch((error) => {
    console.error('[ensure-community-schema] failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
