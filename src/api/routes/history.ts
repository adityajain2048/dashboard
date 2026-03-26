import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/connection.js';
import { CHAIN_SLUGS } from '../../config/chains.js';

const chainSlugs = CHAIN_SLUGS as readonly string[];

const PERIOD_MAP: Record<string, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

const querySchema = z.object({
  src: z.string().refine((s) => chainSlugs.includes(s), { message: 'Invalid src chain' }),
  dst: z.string().refine((s) => chainSlugs.includes(s), { message: 'Invalid dst chain' }),
  asset: z.enum(['ETH', 'USDC', 'USDT']),
  tier: z.enum(['50', '1000', '50000']),
  period: z.enum(['24h', '7d', '30d']).default('24h'),
});

// Lazily check whether quotes_hourly continuous aggregate exists
let hasQuotesHourly: boolean | null = null;
async function checkQuotesHourly(): Promise<boolean> {
  if (hasQuotesHourly !== null) return hasQuotesHourly;
  try {
    await query('SELECT 1 FROM quotes_hourly LIMIT 0');
    hasQuotesHourly = true;
  } catch {
    hasQuotesHourly = false;
  }
  return hasQuotesHourly;
}

interface HourlyRow {
  ts: string;
  bridge: string;
  avg_output_usd: string;
  avg_fee_bps: string;
  quote_count: string;
}

export default async function historyRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/history', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten() });
    }
    const { src, dst, asset, tier, period } = parsed.data;
    const tierNum = parseInt(tier, 10);
    const interval = PERIOD_MAP[period]!;

    const useAgg = await checkQuotesHourly();
    let rows: HourlyRow[];

    if (useAgg) {
      const result = await query<HourlyRow>(
        `SELECT bucket AS ts, bridge,
                avg_output_usd, avg_fee_bps, quote_count
         FROM quotes_hourly
         WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4
           AND bucket > NOW() - $5::interval
         ORDER BY bucket`,
        [src, dst, asset, tierNum, interval]
      );
      rows = result.rows;
    } else {
      const result = await query<HourlyRow>(
        `SELECT date_trunc('hour', ts) AS ts, bridge,
                AVG(CAST(output_usd AS numeric))::text AS avg_output_usd,
                AVG(total_fee_bps)::text AS avg_fee_bps,
                COUNT(*)::text AS quote_count
         FROM quotes
         WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4
           AND ts > NOW() - $5::interval
         GROUP BY date_trunc('hour', ts), bridge
         ORDER BY date_trunc('hour', ts)`,
        [src, dst, asset, tierNum, interval]
      );
      rows = result.rows;
    }

    const dataPoints = rows.map(r => ({
      ts: new Date(r.ts).toISOString(),
      bridge: r.bridge,
      avgOutputUsd: parseFloat(r.avg_output_usd) || 0,
      avgFeeBps: parseFloat(r.avg_fee_bps) || 0,
      quoteCount: parseInt(r.quote_count, 10),
    }));

    return reply.send({
      route: { src, dst, asset, amountTier: tierNum },
      period,
      dataPoints,
    });
  });
}
