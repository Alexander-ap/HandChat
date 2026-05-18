import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const achievements = [
  { name: '初识手语', description: '完成第一次手语识别', icon: 'hand', sortOrder: 1 },
  { name: '交流达人', description: '在社区发布10条动态', icon: 'message_circle', sortOrder: 2 },
  { name: '坚持不懈', description: '连续登录7天', icon: 'target', sortOrder: 3 },
  { name: '聆听者', description: '使用声音检测功能50次', icon: 'volume2', sortOrder: 4 },
  { name: '社区明星', description: '获得100个赞', icon: 'star', sortOrder: 5 },
  { name: '手语大师', description: '完成所有基础课程', icon: 'trophy', sortOrder: 6 },
]

async function main() {
  console.log('Seeding achievements...')
  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { id: achievement.name },
      update: achievement,
      create: { id: achievement.name, ...achievement },
    })
  }
  console.log(`Seeded ${achievements.length} achievements`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
