# HandChat Git 协作指南（前端开发者版）

> **适用对象：** 前端开发人员  
> **仓库地址：** `https://github.com/Alexander-ap/HandChat`  
> **编写日期：** 2026-05-17  
> **维护人：** 后端负责人

---

## 一、项目背景

HandChat 是一个无障碍手语翻译应用，采用**前后端分离**的单仓库（Monorepo）结构。前端（React + Vite）和后端（Express + Prisma）存放在同一个 Git 仓库的不同目录中：

```
HandChat/
├── frontend/          ← 你负责的部分
│   ├── src/app/
│   │   ├── pages/     ← 页面组件
│   │   ├── lib/api.ts ← 后端API调用封装（后端改接口时会更新）
│   │   └── ...
│   └── package.json
├── backend/           ← 后端代码（你不需修改）
├── docs/
│   ├── interfaces.md      ← 【核心】所有接口规范，字段名/类型/必填以此为唯一标准
│   ├── frontend-dev-doc.md ← 前端当前状态 + P1/P2待办清单
│   └── git-workflow.md    ← 你正在看的这份文档
└── ...
```

---

## 二、环境配置

### 2.1 安装 Git

官网下载：https://git-scm.com/download/win  
安装过程一路默认即可，完成后验证：

```powershell
git --version
# 应输出类似：git version 2.47.0
```

### 2.2 配置用户信息（仅首次）

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```

### 2.3 克隆仓库

```powershell
cd 你想要的目录
git clone https://github.com/Alexander-ap/HandChat.git
cd HandChat
```

### 2.4 安装前端依赖

```powershell
cd frontend
npm install
```

### 2.5 启动前端开发服务

```powershell
npm run dev
# 浏览器打开 http://localhost:5173
```

> 注意：前端 API 默认打到 `http://localhost:3001/api`（本地后端）。如需切换，创建 `frontend/.env` 写入 `VITE_API_URL=http://localhost:3001/api`。

---

## 三、仓库权限

当前仓库为 **Public**（公开），任何人可以 Clone 和 Pull，但 Push 需要你自己配置 SSH Key 或通过浏览器认证。

> 如果是 Private 仓库，需先确认管理员已将你的 GitHub 账号添加为 Collaborator。

---

## 四、分支管理策略

### 4.1 分支一览

| 分支 | 用途 | 谁可以改 | 生命周期 |
|------|------|---------|---------|
| `master` | 主干，始终可运行 | 仅后端负责人合并 | 永久 |
| `feat/frontend-xxx` | 前端功能分支 | 你 | 开发完合并后删除 |

### 4.2 命名规范

```
feat/frontend-<简短功能描述>
```

**正确示例：**
```
feat/frontend-post-detail-page     ← 帖子详情页
feat/frontend-follow-user-list     ← 关注用户列表
feat/frontend-fix-points-alignment ← 积分字段修复
```

**错误示例：**
```
my-branch        ← 不知道谁建的、干嘛的
frontend-test    ← 没有 feat/ 前缀
feat/xxx         ← 没标明是前端
```

### 4.3 你的日常工作流（核心）

```
          master
            │
            ├── 你切分支：feat/frontend-xxx
            │       │
            │       ├── 开发功能
            │       ├── git commit
            │       ├── git push
            │       │
            │       └── 去GitHub提Pull Request（或通知后端合并）
            │
            ├── 后端更新了接口文档 / api.ts
            │       │
            ├── 你 git pull origin master ← 拉到最新
            │       │
            └── 继续开发下一个功能
```

---

## 五、操作步骤

### 5.1 每次开始开发前：保持同步

```powershell
# 切换回 master
git checkout master

# 拉取后端最新改动（可能有接口文档更新）
git pull origin master

# 基于最新 master 切新分支
git checkout -b feat/frontend-你的功能名
```

### 5.2 开发过程中：提交代码

```powershell
# 查看改了什么
git status

# 添加你的改动
git add frontend/src/app/pages/你的页面.tsx
git add frontend/src/app/lib/api.ts     # 如果改了API调用

# 提交（格式见第六章）
git commit -m "feat(frontend): 一句话说清你做了什么"

# 推送到 GitHub
git push -u origin feat/frontend-你的功能名
```

### 5.3 功能完成后：通知后端合并

1. 打开 `https://github.com/Alexander-ap/HandChat`
2. GitHub 顶部会出现黄色横幅 "feat/frontend-xxx had recent pushes" → 点 **Compare & pull request**
3. Base 选 `master`，Compare 选你的分支
4. 标题写清功能名称，描述里贴截图或说明
5. 点 **Create pull request**
6. 在群里 @后端负责人，告诉他可以合并了

---

## 六、提交信息规范

### 格式

```
<type>(<scope>): <简短描述>
```

### type 类型（前端常用）

| type | 何时用 |
|------|--------|
| `feat` | 新功能（页面、组件、API对接） |
| `fix` | 修Bug |
| `refactor` | 重构（不改功能，只优化代码） |
| `style` | 改样式/UI |
| `docs` | 改文档 |

### scope 范围

```
frontend    ← 绝大多数情况
```

### 示例

```
feat(frontend): 实现帖子详情页，支持查看完整内容和评论列表

fix(frontend): 修复ProfilePage关注数始终显示0的问题

refactor(frontend): 提取formatTimeAgo为公共工具函数

style(frontend): 调整首页Tab顺序，手语识别移至第一位
```

### 禁止的提交信息

```
update         ← 不知道改了啥
fix bug        ← 不知道修了哪个Bug
改了亿点点      ← 过于随意
commit1        ← 无意义编号
```

---

## 七、冲突解决

当后端改过 `frontend/src/app/lib/api.ts` 而你也改过时，Git 会提示冲突。

### 冲突长这样

```
<<<<<<< HEAD
export const bookmarkApi = { ... }          ← 后端新增的
=======
export const newFeatureApi = { ... }        ← 你新增的
>>>>>>> feat/frontend-xxx
```

### 解决步骤

1. 在 VS Code / IntelliJ 中打开冲突文件，冲突行会高亮
2. **两边都保留**——删掉 `<<<<<<<`、`=======`、`>>>>>>>` 这三行标记
3. 确认代码完整可运行
4. 保存文件

```powershell
git add 冲突文件
git commit -m "merge: 合并后端api.ts更新与前端新功能"
git push
```

> **核心原则：不解别人的代码，只删标记、保留内容。**

---

## 八、代码审查流程

### 后端收到你的 PR 后会检查：

| 检查项 | 说明 |
|--------|------|
| 是否改了 `backend/` 目录 | **不应该**改。如果误改，撤销 |
| 新页面是否符合 `docs/interfaces.md` 字段规范 | 字段名/类型/必填必须一致 |
| 是否用了 Hardcode 假数据 | 禁止。只从 API 取数据 |
| 提交信息是否规范 | 见第六章 |
| 有无 console.log / debugger | 提交前清理 |

### 审查不通过怎么办

后端会在 PR 里留言说明问题，你在**同一个分支**上改，再 `git push`，PR 会自动更新，不需要重新提。

---

## 九、与后端 API 联调的版本同步

### 9.1 权威文件

**`docs/interfaces.md`** 是唯一标准。任何接口的字段名、类型、必填/可选、错误码都以它为准。后端改了接口一定会同步更新这个文件。

### 9.2 后端改了接口后的标准操作

```powershell
git checkout master
git pull origin master                  # ← 拉到最新的接口文档和 api.ts
git checkout -b feat/frontend-新功能名  # ← 基于最新 master 开新分支
```

然后去看 `docs/interfaces.md` 的变更记录（附录B），了解新增/修改了哪些接口。

### 9.3 我调哪个地址？

| 环境 | 地址 | 何时用 |
|------|------|--------|
| 本地后端 | `http://localhost:3001/api` | 日常开发 |
| 生产环境 | `https://jgverskznikedselvshj.supabase.co/functions/v1/make-server-481f4acb` | 线上验证 |

前端 `api.ts` 已配置自动检测：能连本地就优先连本地。

### 9.4 接口尚未实现怎么办

`docs/interfaces.md` 第 4.3 节的"接口实现状态矩阵"会用 🔲 标记未完成的接口。看到 🔲 标记的接口，前端仅做占位 UI 即可（显示"即将上线"等提示）。

---

## 十、日常操作速查表

| 场景 | 命令 |
|------|------|
| 拉最新代码 | `git checkout master && git pull origin master` |
| 开始新功能 | `git checkout -b feat/frontend-xxx` |
| 查看改了什么 | `git status` |
| 提交 | `git add 文件 && git commit -m "feat(frontend): xxx"` |
| 推送 | `git push -u origin feat/frontend-xxx` |
| 切回 master | `git checkout master` |
| 放弃本地改动 | `git restore 文件名` |
| 看你本地所有分支 | `git branch` |

---

## 十一、联系方式

- **接口文档问题：** 直接在 GitHub 上提 Issue，标题写明涉及的接口路径
- **联调阻塞：** 群里 @后端负责人
- **Git 操作疑问：** 先看本文档第十节速查表，再不行群里问

---

> **记住三点就够：**
> 1. 每次开发前 `git pull origin master`
> 2. 只改 `frontend/` 目录
> 3. 接口规范以 `docs/interfaces.md` 为准
