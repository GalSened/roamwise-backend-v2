import express from 'express';
import { z } from 'zod';
import { placesTextSearch, placeDetails } from '../src/providers/google-places.js';
import { cacheKeys, getSearchCache, setSearchCache, getDetailsCache, setDetailsCache } from '../src/ops/cache-places.js';

const router = express.Router();

const SearchBody = z.object({
  query: z.string().min(1).max(120),
  openNow: z.boolean().optional(),
  minRating: z.number().min(0).max(5).optional(),
  priceLevels: z.array(z.enum(['PRICE_LEVEL_INEXPENSIVE','PRICE_LEVEL_MODERATE','PRICE_LEVEL_EXPENSIVE','PRICE_LEVEL_VERY_EXPENSIVE'])).optional(),
  includedType: z.string().optional(), // e.g., "restaurant", "tourist_attraction"
  bias: z.object({
    center: z.object({ latitude: z.number(), longitude: z.number() }),
    radius: z.number().min(100).max(50000)
  }).optional()
});

router.post('/api/places/search', async (req, res) => {
  const lang = req.headers['x-lang'] === 'en' ? 'en' : 'he';
  const v = SearchBody.safeParse(req.body || {});
  if (!v.success) return res.status(400).json({ ok:false, code:'invalid_request', details:v.error.issues });

  const { query, openNow, minRating, priceLevels, includedType, bias } = v.data;
  const k = cacheKeys.keySearch({ query, openNow, minRating, priceLevels, includedType, biasCircle: bias, lang });
  const cached = getSearchCache(k);
  if (cached) return res.json({ ok:true, cached:true, items: cached });

  const r = await placesTextSearch({
    query,
    openNow: !!openNow,
    minRating: minRating ?? 0,
    priceLevels,
    includedType,
    biasCircle: bias ? { center: bias.center, radius: bias.radius } : null,
    lang
  });

  if (!r.ok) return res.status(502).json({ ok:false, code:'provider_error', detail: r.error || r.status || r.body });
  setSearchCache(k, r.items);
  return res.json({ ok:true, cached:false, items: r.items });
});

router.get('/api/places/:id', async (req, res) => {
  const lang = req.headers['x-lang'] === 'en' ? 'en' : 'he';
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ ok:false, code:'invalid_id' });

  const k = cacheKeys.keyDetails(id, lang);
  const cached = getDetailsCache(k);
  if (cached) return res.json({ ok:true, cached:true, place: cached });

  const r = await placeDetails(id, lang);
  if (!r.ok) return res.status(502).json({ ok:false, code:'provider_error', detail:r.error || r.status || r.body });

  setDetailsCache(k, r.detail);
  return res.json({ ok:true, cached:false, place: r.detail });
});

export default router;
