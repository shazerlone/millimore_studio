/**
 * Dummy data powering the UI until the backend engines are wired in.
 * Centralized so every screen reads from one consistent source.
 */

export const trader = {
  name: 'Marcus Sterling',
  handle: '@marcussterling',
  email: 'marcus@millimore.app',
  bio: 'Full-time gold & indices trader. Live every morning at market open. 8 years funded.',
  avatar:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces',
  verified: true,
  online: true
}

export const stats = [
  { key: 'viewers', label: 'Viewers today', value: '2,847', delta: '+12.4%', positive: true },
  { key: 'hours', label: 'Stream hours this month', value: '64.5', delta: '+8.1%', positive: true },
  { key: 'followers', label: 'Followers gained', value: '1,209', delta: '+22.0%', positive: true },
  { key: 'trades', label: 'Trades shown on stream', value: '186', delta: '+5.2%', positive: true }
]

export const recentStreams = [
  { id: 1, title: 'London Open — Gold Scalping', date: 'Jun 26', duration: '2h 14m', viewers: 3120, trades: 9, peak: 3480 },
  { id: 2, title: 'NFP Friday Live Trading', date: 'Jun 25', duration: '3h 02m', viewers: 5740, trades: 14, peak: 6210 },
  { id: 3, title: 'Pre-Market Prep & Watchlist', date: 'Jun 24', duration: '1h 08m', viewers: 1890, trades: 4, peak: 2050 },
  { id: 4, title: 'US30 Power Hour', date: 'Jun 23', duration: '1h 47m', viewers: 2410, trades: 7, peak: 2760 },
  { id: 5, title: 'Asian Session Setups', date: 'Jun 22', duration: '0h 52m', viewers: 980, trades: 3, peak: 1120 }
]

export const destinations = [
  { platform: 'millimore', label: 'Millimore', always: true, color: '#2563EB' },
  { platform: 'youtube', label: 'YouTube', color: '#FF0000' },
  { platform: 'instagram', label: 'Instagram', color: '#E1306C' },
  { platform: 'facebook', label: 'Facebook', color: '#1877F2' }
]

export const qualityOptions = [
  { value: '720p30', title: '720p · 30fps', desc: 'Recommended for slower internet' },
  { value: '1080p30', title: '1080p · 30fps', desc: 'Standard quality' },
  { value: '1080p60', title: '1080p · 60fps', desc: 'High quality, needs fast upload' }
]

/** A representative live trade used for overlay previews. */
export const sampleTrade = {
  id: 'sample',
  event: 'open',
  trader: 'Marcus Sterling',
  verified: true,
  pair: 'XAUUSD',
  direction: 'BUY',
  entry: 2345.5,
  sl: 2330,
  tp: 2370,
  lot: 0.5,
  risk: 1,
  rr: '1:2',
  winRate: 68
}

export const analytics = {
  totalHours: 64.5,
  peakViewers: 6210,
  avgViewers: 2680,
  followersGained: 1209,
  tradesShown: 186,
  mostWatched: 'NFP Friday Live Trading',
  retention: [100, 92, 86, 81, 78, 74, 71, 69, 66, 64, 61, 58],
  platforms: [
    { platform: 'Millimore', value: 58, color: '#2563EB' },
    { platform: 'YouTube', value: 22, color: '#FF0000' },
    { platform: 'Instagram', value: 12, color: '#E1306C' },
    { platform: 'Facebook', value: 8, color: '#1877F2' }
  ]
}

export const mt5Sample = {
  login: '5042118',
  name: 'Marcus Sterling',
  broker: 'IC Markets',
  type: 'Hedge · USD',
  balance: 48250.75,
  equity: 48910.2,
  leverage: '1:100',
  openPositions: 2,
  server: 'ICMarketsSC-Live08'
}
