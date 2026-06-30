# HandChat Git 工作流

> 更新日期：2026-06-30
> 当前真实迭代分支：`feat/frontend-sync-current-code`
> GitHub 默认分支：`main`

## 分支策略

当前仓库历史中仍保留 `master` 和若干历史 `feat/*` 分支，但新的真实迭代基线是 `feat/frontend-sync-current-code`。该分支已经合入 `origin/main` 的初始提交，并已推送到 GitHub。

推荐流程：

```powershell
git checkout feat/frontend-sync-current-code
git pull
git checkout -b feat/<short-feature-name>
```

功能完成后：

```powershell
git status
git add <files>
git commit -m "feat(scope): 简短说明"
git push -u origin feat/<short-feature-name>
```

然后在 GitHub 上创建 PR。当前阶段推荐：

- base：`feat/frontend-sync-current-code`
- compare：你的功能分支

如果团队决定把当前真实基线合入默认分支，再将 base 改为 `main`。

## 提交规范

使用 Conventional Commits：

```text
<type>(<scope>): <summary>
```

常用类型：

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档更新 |
| `refactor` | 不改变行为的重构 |
| `chore` | 构建、依赖、仓库维护 |
| `test` | 测试补充 |

示例：

```powershell
git commit -m "fix(auth): return 503 when Supabase Auth is unavailable"
git commit -m "feat(profile): add user post management pages"
git commit -m "docs: update current iteration baseline"
```

## 提交前检查

后端：

```powershell
cd backend
npm run build
npm run selfcheck
```

前端：

```powershell
cd frontend
npm run build
```

必要时再启动三项服务做手动验证：

```powershell
cd backend
npm run dev

cd frontend
npm run dev

cd CE-CSL
python app.py
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001/api`
- CE-CSL 推理服务：`http://localhost:8008`

## 不要提交的内容

不要提交以下内容：

- `.env`、数据库密码、Supabase service role key、真实私密凭据。
- 本地端口清理脚本、一次性 probe 输出、临时调试 markdown。
- `backend/scripts/_*.mjs`、`backend/tests/` 中的一次性联调脚本。
- `CE-CSL/checkpoints/`、`CE-CSL/models/` 旧模型目录。
- 本地 AI 规则文件，除非团队明确决定纳入仓库。

正式 CE-CSL 模型文件使用：

- `CE-CSL/custom_model.pth`
- `CE-CSL/custom_vocab.json`
- `CE-CSL/gesture_recognizer.task`
- `CE-CSL/hand_landmarker.task`

## 当前远端状态

最近一次基线提交：

```text
684c199 feat(handchat): stabilize current iteration baseline
```

该提交已推送到：

```text
origin/feat/frontend-sync-current-code
```
