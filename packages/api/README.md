# @okon/api

贷款产品匹配 API 服务（Fastify）。

## 运行

```bash
pnpm --filter @okon/api dev
```

默认端口：`3002`

可选环境变量：

- `PORT`：服务端口
- `HOST`：监听地址
- `RULES_DIR`：规则目录（默认 `packages/rule/rules`）

## 主要接口

- `POST /api/intakes`：创建用户信息收集记录
- `PATCH /api/intakes/:intakeId`：增量补充用户信息
- `GET /api/intakes/:intakeId`：查询收集记录
- `POST /api/intakes/:intakeId/match`：基于已收集信息匹配产品
- `POST /api/match`：直接传入完整信息并匹配
- `GET /api/products`：查看已加载产品规则摘要
- `POST /api/files/pdf/extract-text`：上传 PDF 并提取文本

## PDF 提取接口

请求：

- `multipart/form-data`
- 文件字段名：`file`
- 支持 query 参数：`maxChars`（返回文本最大字符数，默认 50000，范围 1000-200000）

示例：

```bash
curl -X POST "http://localhost:3002/api/files/pdf/extract-text?maxChars=30000" \
  -F "file=@/path/to/your.pdf"
```
