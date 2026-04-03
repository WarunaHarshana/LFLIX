import { useState, useCallback } from 'react';
import { apiUrl } from '@/lib/mobileConfig';
import type { IPTVChannel } from '@/app/types';

export function useIPTV() {
  const [iptvChannels, setIptvChannels] = useState<IPTVChannel[]>([]);
  const [iptvCategories, setIptvCategories] = useState<string[]>([]);
  const [iptvCountries, setIptvCountries] = useState<string[]>([]);
  const [selectedIPTVCategory, setSelectedIPTVCategory] = useState<string>('all');
  const [selectedIPTVCountry, setSelectedIPTVCountry] = useState<string>('all');
  const [iptvSearchQuery, setIptvSearchQuery] = useState('');
  const [selectedIPTVChannel, setSelectedIPTVChannel] = useState<IPTVChannel | null>(null);
  const [showIPTVManager, setShowIPTVManager] = useState(false);
  const [loadingIPTV, setLoadingIPTV] = useState(false);

  const fetchIPTVChannels = useCallback(async () => {
    setLoadingIPTV(true);
    try {
      const url = apiUrl('/api/iptv/channels');
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.channels) {
        setIptvChannels(data.channels);
        const cats = [...new Set(data.channels.map((c: IPTVChannel) => c.category).filter(Boolean))] as string[];
        setIptvCategories(cats);
        const countries = [...new Set(data.channels.map((c: IPTVChannel) => c.country).filter(Boolean))] as string[];
        setIptvCountries(countries.sort());
      }
    } catch (e: any) {
      console.warn('Failed to load IPTV channels. Error:', e.message || e);
    } finally {
      setLoadingIPTV(false);
    }
  }, []);

  const deleteIPTVChannel = async (channelId: number) => {
    try {
      const res = await fetch(apiUrl(`/api/iptv/channels?id=${channelId}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setIptvChannels(prev => prev.filter(c => c.id !== channelId));
        if (selectedIPTVChannel?.id === channelId) {
          setSelectedIPTVChannel(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete channel', e);
    }
  };

  return {
    iptvChannels, iptvCategories, iptvCountries,
    selectedIPTVCategory, setSelectedIPTVCategory,
    selectedIPTVCountry, setSelectedIPTVCountry,
    iptvSearchQuery, setIptvSearchQuery,
    selectedIPTVChannel, setSelectedIPTVChannel,
    showIPTVManager, setShowIPTVManager,
    loadingIPTV,
    fetchIPTVChannels, deleteIPTVChannel,
  };
}
