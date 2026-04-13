'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw, Table as TableIcon } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

export default function TableViewerPage() {
  const pathname = usePathname();
  const tableName = pathname.split('/').pop() || '';
  
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();

  const fetchData = async () => {
    if (!tableName) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(100);
        
      if (error) throw error;
      
      setData(rows || []);
      if (rows && rows.length > 0) {
        setColumns(Object.keys(rows[0]));
      } else {
        setColumns([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch table data:', err);
      setError(err.message || 'Failed to fetch table data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tableName]);

  const renderCellValue = (value: any) => {
    if (value === null || value === undefined) return <span className="text-gray-400 italic">null</span>;
    if (typeof value === 'boolean') return <span className={`px-2 py-1 rounded text-xs font-bold ${value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{value.toString()}</span>;
    if (typeof value === 'object') return <span className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-200 truncate max-w-xs inline-block">{JSON.stringify(value)}</span>;
    // Check if looks like a date string
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        try {
            return format(new Date(value), 'MMM d, yyyy HH:mm:ss');
        } catch {
            return value;
        }
    }
    return String(value);
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/database" className="w-10 h-10 bg-white border-2 border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-blue-600" />
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">{tableName}</h1>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-1">Viewing first 100 recent records</p>
          </div>
        </div>
        
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-red-900">Query Error</h3>
          <p className="text-red-700 font-medium mt-1">{error}</p>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-100 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden">
          {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
               <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-600" />
               <p className="font-medium text-sm">Fetching {tableName} data...</p>
             </div>
          ) : data.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-12">
               <TableIcon className="w-12 h-12 text-gray-300 mb-4" />
               <p className="text-lg font-bold text-gray-900">No records found</p>
               <p className="text-sm mt-1">This table does not contain any rows yet.</p>
            </div>
          ) : (
             <div className="overflow-auto flex-1 h-0">
               <table className="w-full text-left border-collapse min-w-max">
                 <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm border-b-2 border-gray-200">
                   <tr>
                     {columns.map(col => (
                       <th key={col} className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider whitespace-nowrap">
                         {col}
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {data.map((row, idx) => (
                     <tr key={idx} className="hover:bg-blue-50/50 transition-colors group">
                       {columns.map(col => (
                         <td key={col} className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                           {renderCellValue(row[col])}
                         </td>
                       ))}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
