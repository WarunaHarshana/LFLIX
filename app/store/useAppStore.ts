import { create } from 'zustand';
import type { ContentItem, Season, DiscoverOnlineItem, TabId } from '../types';

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  showShortcutHelp: boolean;
  setShowShortcutHelp: (show: boolean | ((prev: boolean) => boolean)) => void;

  selectedShow: ContentItem | null;
  setSelectedShow: (show: ContentItem | null) => void;

  seasons: Season[];
  setSeasons: (seasons: Season[]) => void;

  loadingEpisodes: boolean;
  setLoadingEpisodes: (loading: boolean) => void;

  showFolderManager: boolean;
  setShowFolderManager: (show: boolean) => void;

  contextMenu: { x: number; y: number; item: ContentItem } | null;
  setContextMenu: (menu: { x: number; y: number; item: ContentItem } | null) => void;

  selectedDetail: ContentItem | null;
  setSelectedDetail: (item: ContentItem | null) => void;

  focusedIndex: number;
  setFocusedIndex: (index: number | ((prev: number) => number)) => void;

  showMobileConnect: boolean;
  setShowMobileConnect: (show: boolean) => void;

  showDlna: boolean;
  setShowDlna: (show: boolean) => void;

  showMobileSearch: boolean;
  setShowMobileSearch: (show: boolean) => void;

  showLiveSports: boolean;
  setShowLiveSports: (show: boolean) => void;

  showSearchModal: boolean;
  setShowSearchModal: (show: boolean) => void;

  discoverInitialItem: DiscoverOnlineItem | null;
  setDiscoverInitialItem: (item: DiscoverOnlineItem | null) => void;

  discoverMode: 'online' | 'torrents';
  setDiscoverMode: (mode: 'online' | 'torrents') => void;

  torrentInitialQuery: string;
  setTorrentInitialQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'all',
  setActiveTab: (tab) => set({ activeTab: tab }),

  showShortcutHelp: false,
  setShowShortcutHelp: (show) => set((state) => ({ showShortcutHelp: typeof show === 'function' ? show(state.showShortcutHelp) : show })),

  selectedShow: null,
  setSelectedShow: (show) => set({ selectedShow: show }),

  seasons: [],
  setSeasons: (seasons) => set({ seasons }),

  loadingEpisodes: false,
  setLoadingEpisodes: (loading) => set({ loadingEpisodes: loading }),

  showFolderManager: false,
  setShowFolderManager: (show) => set({ showFolderManager: show }),

  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),

  selectedDetail: null,
  setSelectedDetail: (item) => set({ selectedDetail: item }),

  focusedIndex: -1,
  setFocusedIndex: (index) => set((state) => ({ focusedIndex: typeof index === 'function' ? index(state.focusedIndex) : index })),

  showMobileConnect: false,
  setShowMobileConnect: (show) => set({ showMobileConnect: show }),

  showDlna: false,
  setShowDlna: (show) => set({ showDlna: show }),

  showMobileSearch: false,
  setShowMobileSearch: (show) => set({ showMobileSearch: show }),

  showLiveSports: false,
  setShowLiveSports: (show) => set({ showLiveSports: show }),

  showSearchModal: false,
  setShowSearchModal: (show) => set({ showSearchModal: show }),

  discoverInitialItem: null,
  setDiscoverInitialItem: (item) => set({ discoverInitialItem: item }),

  discoverMode: 'online',
  setDiscoverMode: (mode) => set({ discoverMode: mode }),

  torrentInitialQuery: '',
  setTorrentInitialQuery: (query) => set({ torrentInitialQuery: query }),
}));
