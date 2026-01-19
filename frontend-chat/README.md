# OneKey RAG Chat Widget（前端）

本目录是"可一行 script 接入"的文档对话 Widget 前端工程，产物将被构建为静态资源，并由后端同域提供：

- Loader 脚本：`/widget/widget.js`
- iframe 页面：`/widget/`（`index.html` + `assets/*`）

## 本地开发（前端热更新）

1. 安装依赖：
   - `corepack enable && pnpm install`
2. 启动开发服务器：
   - `pnpm dev`

说明：开发模式下默认在 `http://localhost:5173` 提供 iframe 页面；生产模式由后端提供 `/widget/`。

## 构建生产产物

```bash
pnpm build
```

产物在 `dist/` 目录，需拷贝到 `onekey_rag_service/static/widget`。
