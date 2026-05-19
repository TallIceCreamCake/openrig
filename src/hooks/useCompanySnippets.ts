import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface CompanySnippet {
  id: string;
  category: string;
  title: string;
  content: string;
  created_at: string;
}

export const useCompanySnippets = () => {
  const [snippets, setSnippets] = useState<CompanySnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnippets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('company_snippets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSnippets(data || []);
    } catch (e: any) {
      console.error('load snippets', e);
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSnippets(); }, []);

  return { snippets, loading, error, refetch: fetchSnippets };
};

