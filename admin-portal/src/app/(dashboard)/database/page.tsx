'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Database, Table, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function DatabaseExplorerPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('get_all_public_tables');
      if (error) throw error;
      
      // The RPC returns { table_name: string }[]
      setTables(data.map((row: any) => row.table_name));
    } catch (err: any) {
      console.error('Failed to fetch tables:', err);
      setError(err.message || 'Failed to fetch tables. Make sure the migration 098_admin_table_viewer_rpc.sql was executed in Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  return (
    <div className="admin-page-container animate-in fade-in duration-500">
      <div className="page-header-row bg-white p-6 rounded-2xl border border-gray-200">
        <div>
          <h1 className="page-title">Database Explorer</h1>
          <p className="page-subtitle">Browse and inspect all public tables in your Supabase database.</p>
        </div>
        <button
          onClick={fetchTables}
          disabled={loading}
          className="btn btn-secondary"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Schema
        </button>
      </div>

      {error && (
        <div className="db-error-card mt-6">
          <div className="db-error-icon">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Connection Error</h3>
            <p className="font-medium mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading && !error ? (
        <div className="db-grid mt-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="db-card animate-pulse">
              <div className="db-card-header">
                <div className="db-card-title-row">
                  <div className="db-icon-box bg-gray-200" />
                  <div className="h-5 bg-gray-200 rounded w-24" />
                </div>
              </div>
              <div className="db-card-footer">
                <div className="h-4 bg-gray-100 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="db-grid mt-6">
          {tables.map((tableName) => (
            <Link
              key={tableName}
              href={`/database/${tableName}`}
              className="db-card"
            >
              <div className="db-card-header">
                <div className="db-card-title-row">
                  <div className="db-icon-box">
                    <Table className="w-5 h-5" />
                  </div>
                  <h3 className="db-card-title">
                    {tableName}
                  </h3>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="db-card-footer">
                <span className="db-card-footer-label">Public Schema</span>
                <span className="db-card-footer-action">View Data &rarr;</span>
              </div>
            </Link>
          ))}
          {tables.length === 0 && !error && (
            <div className="col-span-full py-12 text-center text-gray-500 font-medium border-2 border-dashed border-gray-100 rounded-3xl">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-10" />
              <p>No tables found in the public schema.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
