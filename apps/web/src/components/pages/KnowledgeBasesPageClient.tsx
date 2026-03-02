'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  ChunkRecord,
  KnowledgeBaseRecord,
  KnowledgeSearchResult,
  SourceFileRecord,
} from '@/types/api';

type SearchMode = 'dense' | 'sparse' | 'hybrid';

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  initialKnowledgeBases: KnowledgeBaseRecord[];
};

export function KnowledgeBasesPageClient({ initialKnowledgeBases }: Props) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>(initialKnowledgeBases);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<number | ''>(
    initialKnowledgeBases[0]?.id ?? '',
  );
  const [sourceFiles, setSourceFiles] = useState<SourceFileRecord[]>([]);
  const [expandedFileId, setExpandedFileId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
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
  const [fileLoading, setFileLoading] = useState(false);
  const [fileDeletingId, setFileDeletingId] = useState<number | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [status, setStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null,
    [knowledgeBases, selectedKnowledgeBaseId],
  );

  // ── Load knowledge bases ──
  const loadKnowledgeBases = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const allRows = await trpc.knowledgeBase.list.query();
      setKnowledgeBases(allRows);
      setSelectedKnowledgeBaseId((currentId) => {
        if (currentId && allRows.some((item) => item.id === currentId)) return currentId;
        return allRows[0]?.id ?? '';
      });
    } catch (error) {
      setStatus(`加载知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  // ── Load source files ──
  const loadSourceFiles = useCallback(
    async (knowledgeBaseId: number | '') => {
      if (!knowledgeBaseId) {
        setSourceFiles([]);
        return;
      }
      setFileLoading(true);
      try {
        const rows = await trpc.knowledgeBase.listSourceFiles.query({ knowledgeBaseId });
        setSourceFiles(rows);
      } catch (error) {
        setStatus(`加载文件列表失败: ${errorMessage(error)}`);
      } finally {
        setFileLoading(false);
      }
    },
    [],
  );

  // ── Load chunks for a source file ──
  const loadChunks = useCallback(
    async (sourceFileId: number) => {
      setChunksLoading(true);
      try {
        const rows = await trpc.knowledgeBase.listChunks.query({ sourceFileId });
        setChunks(rows);
      } catch (error) {
        setStatus(`加载分块失败: ${errorMessage(error)}`);
      } finally {
        setChunksLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSourceFiles(selectedKnowledgeBaseId);
    setSearchResults([]);
    setExpandedFileId(null);
    setChunks([]);
  }, [loadSourceFiles, selectedKnowledgeBaseId]);

  // ── Handlers ──
  const handleCreateKnowledgeBase = async () => {
    const name = newKnowledgeBaseName.trim();
    if (!name) {
      setStatus('请先填写知识库名称。');
      return;
    }
    setKnowledgeSaving(true);
    setStatus('');
    try {
      const created = await trpc.knowledgeBase.create.mutate({
        name,
        description: newKnowledgeBaseDescription.trim() || undefined,
      });
      const createdId = created.id;
      setNewKnowledgeBaseName('');
      setNewKnowledgeBaseDescription('');
      setCreateDialogOpen(false);
      await loadKnowledgeBases();
      if (typeof createdId === 'number') setSelectedKnowledgeBaseId(createdId);
      setStatus('知识库创建成功。');
    } catch (error) {
      setStatus(`创建知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const handleDeleteKnowledgeBase = async (knowledgeBaseId: number) => {
    if (!window.confirm('删除知识库会一并删除该库下所有文件和文档，确认继续吗？')) return;
    setKnowledgeDeletingId(knowledgeBaseId);
    setStatus('');
    try {
      await trpc.knowledgeBase.delete.mutate({ id: knowledgeBaseId });
      await loadKnowledgeBases();
      setStatus('知识库已删除。');
    } catch (error) {
      setStatus(`删除知识库失败: ${errorMessage(error)}`);
    } finally {
      setKnowledgeDeletingId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedKnowledgeBaseId) return;

    setUploading(true);
    setStatus('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/knowledge-base/${selectedKnowledgeBaseId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus(`上传失败: ${data.error || '未知错误'}`);
        return;
      }

      await Promise.all([loadKnowledgeBases(), loadSourceFiles(selectedKnowledgeBaseId)]);
      setStatus(`文件上传成功，已切分为 ${data.chunksCount} 个分块。`);
    } catch (error) {
      setStatus(`上传失败: ${errorMessage(error)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteSourceFile = async (sourceFileId: number) => {
    if (!window.confirm('删除文件将同时删除所有分块，确认继续吗？')) return;
    setFileDeletingId(sourceFileId);
    setStatus('');
    try {
      await trpc.knowledgeBase.deleteSourceFile.mutate({ sourceFileId });
      if (expandedFileId === sourceFileId) {
        setExpandedFileId(null);
        setChunks([]);
      }
      await Promise.all([loadKnowledgeBases(), loadSourceFiles(selectedKnowledgeBaseId)]);
      setStatus('文件已删除。');
    } catch (error) {
      setStatus(`删除文件失败: ${errorMessage(error)}`);
    } finally {
      setFileDeletingId(null);
    }
  };

  const handleToggleChunks = async (sourceFileId: number) => {
    if (expandedFileId === sourceFileId) {
      setExpandedFileId(null);
      setChunks([]);
      return;
    }
    setExpandedFileId(sourceFileId);
    await loadChunks(sourceFileId);
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
      await trpc.knowledgeBase.addDocument.mutate({
        knowledgeBaseId: selectedKnowledgeBaseId,
        title: documentTitle.trim() || undefined,
        content,
        metadata: { source: 'knowledge-base-page' },
      });
      setDocumentTitle('');
      setDocumentContent('');
      await Promise.all([loadKnowledgeBases(), loadSourceFiles(selectedKnowledgeBaseId)]);
      setStatus('文档已添加。');
    } catch (error) {
      setStatus(`添加文档失败: ${errorMessage(error)}`);
    } finally {
      setDocumentSaving(false);
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
      const rows = await trpc.knowledgeBase.search.query({
        knowledgeBaseId: selectedKnowledgeBaseId,
        query,
        topK: 5,
        mode: searchMode,
      });
      setSearchResults(rows);
      setStatus(`检索完成，命中 ${rows.length} 条结果。`);
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
                  左侧选择知识库，右侧上传文件或手动添加文档。
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
          {/* ── 左侧知识库列表 ── */}
          <Card className="border-[var(--line-soft)] bg-white/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg text-[var(--ink-1)]">知识库</CardTitle>
                  <CardDescription className="text-[var(--ink-2)]">共 {knowledgeBases.length} 个</CardDescription>
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
                      <Button className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]">创建</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>创建知识库</DialogTitle>
                        <DialogDescription>创建后可在右侧上传文件或手动添加文档。</DialogDescription>
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
                              文件 {item._count?.sourceFiles ?? 0} · 分块 {item._count?.documents ?? 0} · Bot{' '}
                              {item._count?.bots ?? 0}
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

          {/* ── 右侧详情 ── */}
          <div className="space-y-4">
            {!selectedKnowledgeBase ? (
              <Card className="border-[var(--line-soft)] bg-white/80">
                <CardContent className="p-6 text-sm text-[var(--ink-2)]">
                  请选择左侧知识库后查看文件列表。
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 知识库信息 */}
                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg text-[var(--ink-1)]">{selectedKnowledgeBase.name}</CardTitle>
                        <CardDescription className="mt-1 text-[var(--ink-2)]">
                          {selectedKnowledgeBase.description || '暂无描述'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                          {sourceFiles.length} 个文件
                        </Badge>
                        <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)]">
                          {selectedKnowledgeBase._count?.documents ?? 0} 个分块
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* 文件上传 */}
                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">上传文件</CardTitle>
                    <CardDescription className="text-[var(--ink-2)]">
                      支持 PDF、DOCX、TXT、Markdown，单文件最大 20MB。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        onChange={(e) => void handleFileUpload(e)}
                        disabled={uploading}
                        className="text-sm text-[var(--ink-2)] file:mr-3 file:rounded-lg file:border file:border-[var(--line-soft)] file:bg-[var(--surface-1)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--ink-1)] hover:file:bg-[var(--surface-2)]"
                      />
                      {uploading && <span className="text-sm text-[var(--ink-2)]">上传解析中...</span>}
                    </div>
                  </CardContent>
                </Card>

                {/* 文件列表（SourceFile 为主） */}
                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">文件列表</CardTitle>
                    <CardDescription className="text-[var(--ink-2)]">
                      点击文件可展开查看分块详情。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {fileLoading ? (
                      <div className="text-sm text-[var(--ink-2)]">文件加载中...</div>
                    ) : sourceFiles.length === 0 ? (
                      <div className="text-sm text-[var(--ink-2)]">暂无文件，请上传文件或手动添加文档。</div>
                    ) : (
                      <div className="space-y-2">
                        {sourceFiles.map((file) => {
                          const isExpanded = expandedFileId === file.id;
                          const isDeleting = fileDeletingId === file.id;
                          return (
                            <div key={file.id} className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)]">
                              <div
                                role="button"
                                tabIndex={0}
                                className="flex cursor-pointer items-start justify-between gap-3 p-3"
                                onClick={() => void handleToggleChunks(file.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    void handleToggleChunks(file.id);
                                  }
                                }}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[var(--ink-1)]">{file.fileName}</span>
                                    <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)] text-xs">
                                      {file.fileType}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--ink-2)]">
                                    <span>{file._count?.documents ?? 0} chunks</span>
                                    <span>{formatFileSize(file.fileSize)}</span>
                                    <span>{formatDate(file.createdAt)}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[var(--ink-2)]">{isExpanded ? '收起' : '展开'}</span>
                                  <Button
                                    variant="outline"
                                    className="border-[#dc6f6848] text-[#a53f37] hover:bg-[#fff4f3]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteSourceFile(file.id);
                                    }}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? '删除中...' : '删除'}
                                  </Button>
                                </div>
                              </div>

                              {/* 展开的 chunk 列表 */}
                              {isExpanded && (
                                <div className="border-t border-[var(--line-soft)] p-3">
                                  {chunksLoading ? (
                                    <div className="text-xs text-[var(--ink-2)]">分块加载中...</div>
                                  ) : chunks.length === 0 ? (
                                    <div className="text-xs text-[var(--ink-2)]">无分块数据。</div>
                                  ) : (
                                    <div className="space-y-2">
                                      {chunks.map((chunk) => {
                                        const preview =
                                          chunk.content.length > 160
                                            ? `${chunk.content.slice(0, 160)}...`
                                            : chunk.content;
                                        return (
                                          <div
                                            key={chunk.id}
                                            className="rounded-lg border border-[var(--line-soft)] bg-white p-2"
                                          >
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="border-[var(--line-soft)] text-[var(--ink-2)] text-xs">
                                                #{chunk.chunkIndex}
                                              </Badge>
                                              {chunk.title && (
                                                <span className="text-xs text-[var(--ink-2)]">{chunk.title}</span>
                                              )}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--ink-2)]">
                                              {preview}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 手动添加文档 */}
                <Card className="border-[var(--line-soft)] bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--ink-1)]">手动添加文档</CardTitle>
                    <CardDescription className="text-[var(--ink-2)]">
                      直接粘贴文本内容作为单个文档入库。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      value={documentTitle}
                      onChange={(event) => setDocumentTitle(event.target.value)}
                      placeholder="文档标题（可选）"
                      disabled={documentSaving}
                    />
                    <Textarea
                      value={documentContent}
                      onChange={(event) => setDocumentContent(event.target.value)}
                      rows={6}
                      placeholder="粘贴文档正文内容..."
                      disabled={documentSaving}
                    />
                    <div className="flex items-center justify-end">
                      <Button
                        className="bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]"
                        onClick={() => void handleAddDocument()}
                        disabled={documentSaving}
                      >
                        {documentSaving ? '添加中...' : '添加文档'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 检索测试 */}
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
                          <div
                            key={`${index}-${item.score}`}
                            className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-1)] p-3"
                          >
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
