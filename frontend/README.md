# OneKey RAG Widget（前端）

本目录是“可一行 script 接入”的文档对话 Widget 前端工程，产物将被构建为静态资源，并由后端同域提供：

- Loader 脚本：`/widget/widget.js`
- iframe 页面：`/widget/`（`index.html` + `assets/*`）

## 本地开发（前端热更新）

1. 安装依赖：
   - `npm install`
2. 启动开发服务器：
   - `npm run dev`

说明：开发模式下默认在 `http://localhost:5173` 提供 iframe 页面；生产模式由后端提供 `/widget/`。

