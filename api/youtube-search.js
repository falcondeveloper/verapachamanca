const credentials = require('../lib/credentials');
const { requireSiteAccess, setNoStore } = require('../lib/http');

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

function cleanText(value, max = 200) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : '';
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

module.exports = async function handler(req, res) {
  setNoStore(res);
  if (!requireSiteAccess(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const query = cleanText(req.query?.q);
  if (!query) return res.status(400).json({ error: 'Enter a song name or artist to search YouTube.' });

  const apiKey = credentials.youtube?.apiKey;
  if (!apiKey) return res.status(500).json({ error: 'YouTube search is not configured.' });

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) {
    return res.status(200).json({ query, results: cached.results, cached: true });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: '8',
      order: 'relevance',
      videoEmbeddable: 'true',
      safeSearch: 'moderate',
      key: apiKey
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = data?.error?.errors?.[0]?.reason || '';
      console.error('YouTube search API error:', response.status, reason);
      if (response.status === 403) {
        return res.status(502).json({ error: 'YouTube search is temporarily unavailable. Check the YouTube API key/quota.' });
      }
      return res.status(502).json({ error: 'YouTube search is temporarily unavailable. Please try again.' });
    }

    const results = (Array.isArray(data.items) ? data.items : [])
      .map(item => {
        const videoId = String(item?.id?.videoId || '');
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
        const snippet = item.snippet || {};
        const thumbs = snippet.thumbnails || {};
        return {
          video_id: videoId,
          title: decodeBasicEntities(snippet.title),
          channel_title: decodeBasicEntities(snippet.channelTitle),
          thumbnail_url: thumbs.medium?.url || thumbs.default?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`
        };
      })
      .filter(Boolean);

    cache.set(cacheKey, { savedAt: Date.now(), results });
    return res.status(200).json({ query, results, cached: false });
  } catch (error) {
    console.error('YouTube search request failed:', error);
    return res.status(502).json({ error: 'Unable to reach YouTube right now. Please try again.' });
  }
};
