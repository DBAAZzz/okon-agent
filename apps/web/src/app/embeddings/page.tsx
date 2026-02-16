'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export default function EmbeddingsPage() {
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'dense' | 'sparse' | 'hybrid'>('hybrid');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAdd = async () => {
    if (!content.trim()) return;

    setLoading(true);
    setMessage('');

    try {
      const data = await trpc.embeddings.add.mutate({ content });
      setMessage(`✓ Added: ${data.id}`);
      setContent('');
    } catch (error) {
      setMessage(`✗ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setMessage('');

    try {
      const data = await trpc.embeddings.search.query({ query, topK: 5, mode });
      setResults(data.results);
      setMessage(`✓ Found ${data.results.length} results (${mode})`);
    } catch (error) {
      setMessage(`✗ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Embeddings</h1>

      {/* Add Document */}
      <section className="mb-8 p-6 border rounded">
        <h2 className="text-xl font-semibold mb-4">Add Document</h2>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter text to add..."
          className="w-full p-3 border rounded mb-4 min-h-[100px]"
          disabled={loading}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !content.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </section>

      {/* Search */}
      <section className="mb-8 p-6 border rounded">
        <h2 className="text-xl font-semibold mb-4">Search</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'dense' | 'sparse' | 'hybrid')}
            className="w-full p-3 border rounded"
            disabled={loading}
          >
            <option value="dense">Dense</option>
            <option value="sparse">Sparse (BM25)</option>
            <option value="hybrid">Hybrid (Dense + Sparse)</option>
          </select>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter search query..."
          className="w-full p-3 border rounded mb-4"
          disabled={loading}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </section>

      {/* Message */}
      {message && (
        <div className="mb-4 p-3 border rounded bg-gray-50">
          {message}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <section className="p-6 border rounded">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div key={index} className="p-4 border rounded bg-gray-50">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Score: {result.score.toFixed(3)}</span>
                </div>
                <p className="text-gray-700">{result.content}</p>
                {result.metadata && (
                  <pre className="mt-2 text-xs text-gray-500">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
