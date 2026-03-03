# tRPC 与 Next.js BFF 讨论纪要

记录时间：2026-03-02  
记录范围：本次关于 `tRPC`、Next.js `app/api/*` BFF 层、上传接口选型、以及 Go/gRPC 可替代性的讨论。

## 1. Next.js `app/api/*/route.ts` 的作用

这些文件是 Next.js App Router 的 Route Handler，用来在 Web 侧提供同源接口（BFF 层），再由服务端转发到 Agent。

当前项目中的典型用途：

1. `app/api/trpc/[trpc]/route.ts`：代理 tRPC 请求。
2. `app/api/chat/route.ts`：代理聊天主接口。
3. `app/api/chat/stream/route.ts`、`app/api/chat/continue/route.ts`：代理流式/SSE相关接口。
4. `app/api/knowledge-base/[...path]/route.ts`：代理知识库相关 REST 接口。

## 2. 为什么这是最佳实践（在本项目里）

1. 前端不再硬编码后端地址，环境迁移成本低。
2. 同源请求，降低 CORS/Cookie/鉴权复杂度。
3. 入口统一，便于做日志、限流、安全策略和网关治理。
4. 后端拓扑对前端透明，后续改造后端不影响前端调用路径。
5. 与 Next.js App Router 的“服务端边界 + 客户端交互”分层一致。

## 3. `runtime` 与 `dynamic` 配置含义

在 `route.ts` 中：

1. `export const runtime = 'nodejs';`
   作用：强制使用 Node.js Runtime，适合代理、流式响应、服务端环境变量读取等场景。
2. `export const dynamic = 'force-dynamic';`
   作用：强制每次请求动态执行，不做静态化或缓存优化，适合聊天流和实时业务。

## 4. Next.js 是否“自带 BFF”

结论：Next.js 没有单独名为“BFF模块”的组件，但原生提供了构建 BFF 的能力（Route Handlers）。  
也就是：`app/api/**/route.ts` + 服务端逻辑 = 项目中的 BFF 层。

## 5. BFF 路径是否必须固定为 `/api/*`

不是必须。  
`route.ts` 目录结构决定 URL 路径，例如：

1. `app/api/chat/route.ts` -> `/api/chat`
2. `app/bff/chat/route.ts` -> `/bff/chat`

实践中常用 `/api/*`，因为语义清晰且便于避免与页面路由冲突。

## 6. 使用 `proxyToAgent` 后 tRPC 类型推导会不会丢失

不会（前提是仍通过 `trpc.xxx.query/mutate` 调用）。

原因：  
类型推导来自 `createTRPCClient<AppRouter>` 的 TypeScript 泛型，与“实际网络地址”无关。  
代理层只改变传输路径（`/api/trpc` -> Agent），不改变 tRPC 协议和类型系统。

需要注意：如果是手写 `fetch('/api/...')` 的 REST 接口，本来就不享受 tRPC 端到端推导，需要自行定义类型。

## 7. 为什么知识库上传不用 tRPC

结论：这是合理分层，不是架构混乱。

1. 上传是 `multipart/form-data` 二进制场景，天然更适合 HTTP 上传路由。
2. 若强行用 JSON RPC，常需 base64，体积和成本更高。
3. 上传链路通常要处理文件大小限制、解析失败、流式处理等，独立 upload route 更直接。

推荐模式：  
结构化业务调用用 tRPC；文件上传/流式场景用 REST。  
本项目已通过 Next BFF 统一入口，调用体验和安全边界是一致的。

## 8. 什么时候该用 tRPC

适合：

1. 前后端都用 TypeScript。
2. 主要客户端由同一团队维护（内部系统/控制台）。
3. 追求迭代效率和端到端类型安全。

不优先：

1. 对外开放给第三方的大型公共 API。
2. 多语言、多客户端强异构生态。
3. 需要强版本治理和标准化开放文档优先。

## 9. tRPC 是否必须 Monorepo

不必须。  
Monorepo 只是最方便共享类型。  
非 Monorepo 也可用：将后端类型产物发布为独立包给前端依赖。

## 10. 后端是 Go 时能否用 gRPC 替代

可以替代“结构化 RPC”部分，但不是 1:1 替代全部 Web 接口形态。

1. Go 内部服务间非常适合 gRPC。
2. 浏览器侧一般需要 gRPC-Web 或 BFF 转换层。
3. 文件上传、SSE 流等能力通常仍保留 HTTP 接口。

## 11. Fastify 是否支持 gRPC

Fastify 不内置原生 gRPC Server 能力（它是 HTTP 框架），但可与 gRPC 组合：

1. 独立起 `@grpc/grpc-js` 服务。
2. Fastify 作为 HTTP/BFF 层调用 gRPC 后端。
3. 面向浏览器时使用 gRPC-Web 或 BFF 协议转换。

## 12. 本项目最终建议

1. 保持“tRPC + REST（上传/流式）”混合模式。
2. 统一通过 Next 同源 BFF 入口暴露给前端。
3. 持续把类型推导用于关键业务链路，减少 `any/unknown as`。
4. 若后端未来迁移到 Go，可逐步引入 gRPC 于内部服务，Web 层维持 BFF 稳定入口。

