
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BotCredentials {
  reddit_client_id: string | null;
  reddit_client_secret: string | null;
  reddit_username: string | null;
  reddit_password: string | null;
  gemini_api_key: string | null;
}

export const useBotCredentials = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<BotCredentials>({
    reddit_client_id: null,
    reddit_client_secret: null,
    reddit_username: null,
    reddit_password: null,
    gemini_api_key: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchCredentials();
    } else {
      setCredentials({
        reddit_client_id: null,
        reddit_client_secret: null,
        reddit_username: null,
        reddit_password: null,
        gemini_api_key: null,
      });
      setLoading(false);
    }
  }, [user]);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bot_credentials')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching credentials:', error);
        toast.error('Failed to load credentials');
        return;
      }

      if (data) {
        setCredentials({
          reddit_client_id: data.reddit_client_id,
          reddit_client_secret: data.reddit_client_secret,
          reddit_username: data.reddit_username,
          reddit_password: data.reddit_password,
          gemini_api_key: data.gemini_api_key,
        });
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  const updateCredentials = async (newCredentials: Partial<BotCredentials>) => {
    if (!user) {
      toast.error('Please sign in to save credentials');
      return false;
    }

    try {
      const updatedCredentials = { ...credentials, ...newCredentials };

      const { error } = await supabase
        .from('bot_credentials')
        .upsert({
          user_id: user.id,
          ...updatedCredentials,
        });

      if (error) {
        console.error('Error updating credentials:', error);
        toast.error('Failed to save credentials');
        return false;
      }

      setCredentials(updatedCredentials);
      toast.success('Credentials saved successfully');
      return true;
    } catch (error) {
      console.error('Error updating credentials:', error);
      toast.error('Failed to save credentials');
      return false;
    }
  };

  const isRedditConnected = () => {
    return !!(
      credentials.reddit_client_id &&
      credentials.reddit_client_secret &&
      credentials.reddit_username &&
      credentials.reddit_password
    );
  };

  const isGeminiConnected = () => {
    return !!credentials.gemini_api_key;
  };

  return {
    credentials,
    loading,
    updateCredentials,
    isRedditConnected,
    isGeminiConnected,
    fetchCredentials,
  };
};
