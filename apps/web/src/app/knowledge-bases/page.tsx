'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@okon/ui';
import { trpc } from '@/lib/trpc';

type SearchMode = 'dense' | 'sparse' | 'hybrid';

type KnowledgeBaseRecord = {
  id: number;
  name: string;
  description: string | null;
  _count?: {
    documents: number;
    bots: number;
  };
};

type KnowledgeDocumentRecord = {
  id: number;
  title: string | null;
  content: string;
  metadata: unknown;
  createdAt: string;
};

type KnowledgeSearchResult = {
  content: string;
  title?: string;
  score: number;
  metadata?: Record<string, unknown>;
};

type KnowledgeBaseApi = {
  list: { query: () => Promise<unknown> };
  create: { mutate: (input: { name: string; description?: string }) => Promise<unknown> };
  delete: { mutate: (input: { id: number }) => Promise<unknown> };
  addDocument: {
    mutate: (input: {
      knowledgeBaseId: number;
      content: string;
      title?: string;
      metadata?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  deleteDocument: { mutate: (input: { documentId: number }) => Promise<unknown> };
  listDocuments: { query: (input: { knowledgeBaseId: number }) => Promise<unknown> };
  search: {
    query: (input: {
      knowledgeBaseId: number;
      query: string;
      topK?: number;
      mode?: SearchMode;
    }) => Promise<unknown>;
  };
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function KnowledgeBasesPage() {
  const knowledgeBaseApi = useMemo(() => trpc.knowledgeBase as unknown as KnowledgeBaseApi, []);

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<number | ''>('');
  const [documents, setDocuments] = useState<KnowledgeDocumentRecord[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState('');
  const [newKnowledgeBaseDescription, setNewKnowledgeBaseDescription] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');

  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeDeletingId, setKnowledgeDeletingId] = useState<number | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentDeletingId, setDocumentDeletingId] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [status, setStatus] = useState('');

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null,
    [knowledgeBases, selectedKnowledgeBaseId]
  );

  const loadKnowledgeBases = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const rows = await knowledgeBaseApi.list.query();
      const allRows = rows as KnowledgeBaseRecord[];
      setKnowledgeBases(allRows);
      setSelectedKnowledgeBaseId((currentId) => {
        if (currentId && allRows.some((item) => item.id === currentId)) {
          return currentId;
        }
        return allRows[0]?.id ?? '';
      });
    } catch (error) {
      setStatus(`加载知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [knowledgeBaseApi]);

  const loadDocuments = useCallback(async (knowledgeBaseId: number | '') => {
    if (!knowledgeBaseId) {
      setDocuments([]);
      return;
    }

    setDocumentLoading(true);
    try {
      const rows = await knowledgeBaseApi.listDocuments.query({ knowledgeBaseId });
      setDocuments(rows as KnowledgeDocumentRecord[]);
    } catch (error) {
      setStatus(`加载文档失败: ${errorMessage(error)}`);
    } finally {
      setDocumentLoading(false);
    }
  }, [knowledgeBaseApi]);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => {
    void loadDocuments(selectedKnowledgeBaseId);
    setSearchResults([]);
  }, [loadDocuments, selectedKnowledgeBaseId]);

  const handleCreateKnowledgeBase = async () => {
    const name = newKnowledgeBaseName.trim();
    if (!name) {
      setStatus('请先填写知识库名称。');
      return;
    }

    setKnowledgeSaving(true);
    setStatus('');
    try {
      const created = await knowledgeBaseApi.create.mutate({
        name,
        description: newKnowledgeBaseDescription.trim() || undefined,
      });

      const createdId = (created as { id?: number }).id;
      setNewKnowledgeBaseName('');
      setNewKnowledgeBaseDescription('');
      setCreateDialogOpen(false);

      await loadKnowledgeBases();
      if (typeof createdId === 'number') {
        setSelectedKnowledgeBaseId(createdId);
      }
      setStatus('知识库创建成功。');
    } catch (error) {
      setStatus(`创建知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const handleDeleteKnowledgeBase = async (knowledgeBaseId: number) => {
    const confirmed = window.confirm('删除知识库会一并删除该库下文档，确认继续吗？');
    if (!confirmed) {
      return;
    }

    setKnowledgeDeletingId(knowledgeBaseId);
    setStatus('');
    try {
      await knowledgeBaseApi.delete.mutate({ id: knowledgeBaseId });
      await loadKnowledgeBases();
      setStatus('知识库已删除。');
    } catch (error) {
      setStatus(`删除知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeDeletingId(null);
    }
  };

  const handleAddDocument = async () => {
    if (!selectedKnowledgeBaseId) {
      setStatus('请先选择一个知识库。');
      return;
    }

    const content = documentContent.trim();
    if (!content) {
      setStatus('请填写文档内容。');
      return;
    }

    setDocumentSaving(true);
    setStatus('');
    try {
      await knowledgeBaseApi.addDocument.mutate({
        knowledgeBaseId: selectedKnowledgeBaseId,
        title: documentTitle.trim() || undefined,
        content,
        metadata: { source: 'knowledge-base-page' },
      });
      setDocumentTitle('');
      setDocumentContent('');
      await Promise.all([
        loadKnowledgeBases(),
        loadDocuments(selectedKnowledgeBaseId),
      ]);
      setStatus('文档已添加。');
    } catch (error) {
      setStatus(`添加文档失败: ${errorMessage(error)}`);
    } finally {
      setDocumentSaving(false);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!selectedKnowledgeBaseId) {
      return;
    }

    setDocumentDeletingId(documentId);
    setStatus('');
    try {
      await knowledgeBaseApi.deleteDocument.mutate({ documentId });
      await Promise.all([
        loadKnowledgeBases(),
        loadDocuments(selectedKnowledgeBaseId),
      ]);
      setStatus('文档已删除。');
    } catch (error) {
      setStatus(`删除文档失败: ${errorMessage(error)}`);
    } finally {
      setDocumentDeletingId(null);
    }
  };

  const handleSearch = async () => {
    if (!selectedKnowledgeBaseId) {
      setStatus('请先选择一个知识库。');
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setStatus('请输入检索问题。');
      return;
    }

    setSearchLoading(true);
    setStatus('');
    try {
      const rows = await knowledgeBaseApi.search.query({
        knowledgeBaseId: selectedKnowledgeBaseId,
        query,
        topK: 5,
        mode: searchMode,
      });
      const results = rows as KnowledgeSearchResult[];
      setSearchResults(results);
      setStatus(`检索完成，命中 ${results.length} 条结果。`);
    } catch (error) {
      setStatus(`检索失败: ${errorMessage(error)}`);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="border-[var(--line-soft)] bg-[var(--surface-1)] shadow-[0_28px_80px_-40px_rgba(24,38,59,0.55)]">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl text-[var(--ink-1)]">知识库管理</CardTitle>
                <CardDescription className="mt-2 text-[var(--ink-2)]">
                  左侧选择知识库，右侧查看文档列表并进行维护。
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                  <Link href="/">返回首页</Link>
                </Button>
                <Button asChild variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                  <Link href="/bots">Bot 管理</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="border-[var(--line-soft)] bg-white/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg text-[var(--ink-1)]">知识库</CardTitle>
                  <CardDescription className="text-[var(--ink-2)]">
                    共 {knowledgeBases.length} 个
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-[var(--line-soft)] text-[var(--ink-2)]"
                    onClick={() => void loadKnowledgeBases()}
                    disabled={knowledgeLoading || knowledgeSaving}
                  >
                    {knowledgeLoading ? '刷新中...' : '刷新'}
                  </Button>
                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">
                        创建
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>创建知识库</DialogTitle>
                        <DialogDescription>创建后可在右侧添加文档并进行检索测试。</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="kb-name">知识库名称</Label>
                          <Input
                            id="kb-name"
                            value={newKnowledgeBaseName}
                            onChange={(event) => setNewKnowledgeBaseName(event.target.value)}
                            placeholder="例如：产品文档"
                            disabled={knowledgeSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="kb-description">描述（可选）</Label>
                          <Textarea
                            id="kb-description"
                            value={newKnowledgeBaseDescription}
                            onChange={(event) => setNewKnowledgeBaseDescription(event.target.value)}
                            rows={4}
                            placeholder="知识库用途说明..."
                            disabled={knowledgeSaving}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          className="border-[var(--line-soft)] text-[var(--ink-2)]"
                          onClick={() => setCreateDialogOpen(false)}
                          disabled={knowledgeSaving}
                        >
                          取消
                        </Button>
                        <Button
                          className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                          onClick={() => void handleCreateKnowledgeBase()}
                          disabled={knowledgeSaving}
                        >
                          {knowledgeSaving ? '创建中...' : '创建知识库'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {knowledgeLoading ? (
                <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-sm text-[var(--ink-2)]">
                  正在加载知识库...
                </div>
              ) : knowledgeBases.length === 0 ? (
                <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-3 text-sm text-[var(--ink-2)]">
                  暂无知识库，请先创建。
                </div>
              ) : (
                <div className="space-y-2">
                  {knowledgeBases.map((item) => {
                    const isSelected = selectedKnowledgeBaseId === item.id;
                    const isDeleting = knowledgeDeletingId === item.id;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedKnowledgeBaseId(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedKnowledgeBaseId(item.id);
                          }
                        }}
                        className={`w-full cursor-pointer rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-[rgba(15,118,110,0.35)] bg-[#f1fbf8]'
                            : 'border-[var(--line-soft)] bg-[var(--surface-1)] hover:border-[rgba(15,118,110,0.2)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--ink-1)]">{item.name}</div>
                            {item.description ? (
                              <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-2)]">{item.description}</div>
                            ) : null}
                            <div className="mt-2 text-xs text-[var(--ink-2)]">
                              文档 {item._count?.documents ?? 0} · 绑定 Bot {item._count?.bots ?? 0}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            className="border-[#dc6f6848] text-[#a53f37] hover:bg-[#fff4f3]"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteKnowledgeBase(item.id);
                            }}
                            disabled={knowledgeSaving || isDeleting}
                          >
                            {isDeleting ? '删除中...' : '删除'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {!selectedKnowledgeBase ? (
              <Card className="border-[var(--line-soft)] bg-white/80">
                <CardContent className="p-6 text-sm text-[var(--ink-2)]">
                  请选择左侧知识库后查看「文档列表」。
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-[var(--ink-1)]">{selectedKnowledgeBase.name}</CardTitle>
                        <CardDescription className="mt-1 text-[var(--ink-2)]">
                          {selectedKnowledgeBase.description || '暂无描述'}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                        当前文档数 {documents.length}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">文档列表</CardTitle>
                    <CardDescription className="text-[var(--ink-2)]">
                      当前知识库中的文档会在 Bot 对话时用于检索召回。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {documentLoading ? (
                      <div className="text-sm text-[var(--ink-2)]">文档加载中...</div>
                    ) : documents.length === 0 ? (
                      <div className="text-sm text-[var(--ink-2)]">暂无文档。</div>
                    ) : (
                      <div className="space-y-2">
                        {documents.map((doc) => {
                          const deleting = documentDeletingId === doc.id;
                          const preview = doc.content.length > 220
                            ? `${doc.content.slice(0, 220)}...`
                            : doc.content;
                          return (
                            <div key={doc.id} className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-[var(--ink-1)]">
                                    {doc.title || '未命名文档'}
                                  </div>
                                  <div className="mt-1 text-xs text-[var(--ink-2)]">{formatDate(doc.createdAt)}</div>
                                </div>
                                <Button
                                  variant="outline"
                                  className="border-[#dc6f6848] text-[#a53f37] hover:bg-[#fff4f3]"
                                  onClick={() => void handleDeleteDocument(doc.id)}
                                  disabled={documentSaving || deleting}
                                >
                                  {deleting ? '删除中...' : '删除'}
                                </Button>
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-xs text-[var(--ink-2)]">{preview}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">添加文档</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      value={documentTitle}
                      onChange={(event) => setDocumentTitle(event.target.value)}
                      placeholder="文档标题（可选）"
                      disabled={documentSaving || documentLoading}
                    />
                    <Textarea
                      value={documentContent}
                      onChange={(event) => setDocumentContent(event.target.value)}
                      rows={6}
                      placeholder="粘贴文档正文内容..."
                      disabled={documentSaving || documentLoading}
                    />
                    <div className="flex items-center justify-end">
                      <Button
                        className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                        onClick={() => void handleAddDocument()}
                        disabled={documentSaving || documentLoading}
                      >
                        {documentSaving ? '添加中...' : '添加文档'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">检索测试</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]">
                      <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="输入检索问题..."
                        disabled={searchLoading}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleSearch();
                          }
                        }}
                      />
                      <Select
                        value={searchMode}
                        onValueChange={(value) => setSearchMode(value as SearchMode)}
                        disabled={searchLoading}
                      >
                        <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white text-sm focus-visible:ring-[var(--brand)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                          <SelectItem value="dense">Dense</SelectItem>
                          <SelectItem value="sparse">Sparse</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                        onClick={() => void handleSearch()}
                        disabled={searchLoading}
                      >
                        {searchLoading ? '检索中...' : '检索'}
                      </Button>
                    </div>

                    {searchResults.length > 0 ? (
                      <div className="space-y-2">
                        {searchResults.map((item, index) => (
                          <div key={`${index}-${item.score}`} className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-[var(--ink-1)]">
                                {item.title || `命中结果 ${index + 1}`}
                              </div>
                              <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                                score {item.score.toFixed(3)}
                              </Badge>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-xs text-[var(--ink-2)]">
                              {item.content.length > 280 ? `${item.content.slice(0, 280)}...` : item.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {status ? (
          <div className="rounded-xl border border-[var(--line-soft)] bg-white/80 px-3 py-2 text-sm text-[var(--ink-2)]">
            {status}
          </div>
        ) : null}
      </div>
    </main>
  );
}
