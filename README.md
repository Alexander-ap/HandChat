# HandChat

HandChat 是一个前后端分离的手语与无障碍辅助应用，包含 React/Vite 前端、Express/Prisma 后端和 CE-CSL 手语识别参考实现。

当前真实迭代基线在 `feat/frontend-sync-current-code`。该分支已经合入远端默认分支 `main` 的初始提交，后续开发请先阅读 [当前迭代基线](docs/current-iteration-baseline.md)。

## 快速启动

```powershell
cd backend
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

```powershell
cd CE-CSL
python app.py
```

默认地址：

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`
- Inference service: `http://localhost:8008`

## 提交前检查

```powershell
cd backend
npm run build
npm run selfcheck
```

```powershell
cd frontend
npm run build
```
