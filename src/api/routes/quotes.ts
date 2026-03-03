import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { CHAIN_SLUGS } from '../../config/chains.js';
import { getQuotesForRoute } from '../../db/queries.js';

const chainSlugs = CHAIN_SLUGS as readonly string[];
const querySchema = z.object({
  src: z.string().refine((s) => chainSlugs.includes(s), { message: 'Invalid src chain' }),
  dst: z.string().refine((s) => chainSlugs.includes(s), { message: 'Invalid dst chain' }),
  asset: z.enum(['ETH', 'USDC', 'USDT']),
  tier: z.enum(['50', '1000', '50000']),
});

export default async function quotesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/quotes', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid or missing query params', details: parsed.error.flatten() });
    }
    const { src, dst, asset, tier } = parsed.data;
    const tierNum = parseInt(tier, 10);
    const quotes = await getQuotesForRoute(src, dst, asset as 'ETH' | 'USDC' | 'USDT', tierNum);
    const fetchedAt = quotes.length > 0 && quotes[0]?.ts ? quotes[0].ts.toISOString() : new Date().toISOString();
    return reply.send({
      route: { src, dst, asset, amountTier: tierNum },
      quotes,
      fetchedAt,
      quoteCount: quotes.length,
    });
  });
}
