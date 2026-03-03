import type { ReactNode } from 'react';
import { getChainMeta } from '../config/chains';

interface ChainIconProps {
  chain: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const SIZES = {
  xs: { box: 16, font: 6 },
  sm: { box: 20, font: 7 },
  md: { box: 28, font: 9 },
  lg: { box: 36, font: 12 },
};

/** Chain SVG logos — inline for the major chains, fallback to colored circle */
function ChainSVG({ chain, size }: { chain: string; size: number }): ReactNode {
  const meta = getChainMeta(chain);
  const r = size / 2;

  // SVG logos for popular chains
  switch (chain) {
    case 'ethereum':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 4v9.2l7.8 3.5L16 4z" fill="#fff" opacity=".6" />
          <path d="M16 4L8.2 16.7 16 13.2V4z" fill="#fff" />
          <path d="M16 22.1v5.9l7.8-10.8L16 22.1z" fill="#fff" opacity=".6" />
          <path d="M16 28v-5.9l-7.8-4.9L16 28z" fill="#fff" />
          <path d="M16 20.7l7.8-4L16 13.2v7.5z" fill="#fff" opacity=".2" />
          <path d="M8.2 16.7l7.8 4v-7.5l-7.8 3.5z" fill="#fff" opacity=".5" />
        </svg>
      );

    case 'arbitrum':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#28A0F0" />
          <path d="M16.5 8l6.5 11.3-2 1.1-5.3-9.2-.2.3 4.7 8.2-2 1.1L12 10l.5-.9h3l1-1.1z" fill="#fff" />
          <path d="M10 20.5l2-1.1 2.7 4.6-2.2 1.3L10 20.5z" fill="#fff" />
        </svg>
      );

    case 'base':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#0052FF" />
          <path d="M16 26c5.5 0 10-4.5 10-10S21.5 6 16 6C10.8 6 6.5 10 6 15.1h13.3v1.8H6C6.5 22 10.8 26 16 26z" fill="#fff" />
        </svg>
      );

    case 'optimism':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#FF0420" />
          <text x="16" y="20" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="sans-serif">OP</text>
        </svg>
      );

    case 'polygon':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#8247E5" />
          <path d="M21.2 13.2c-.4-.2-.9-.2-1.3 0l-3 1.7-2 1.2-3 1.7c-.4.2-.9.2-1.3 0l-2.4-1.4c-.4-.2-.6-.7-.6-1.1v-2.7c0-.5.2-.9.6-1.1l2.3-1.3c.4-.2.9-.2 1.3 0l2.3 1.3c.4.2.6.7.6 1.1v1.7l2-1.2v-1.7c0-.5-.2-.9-.6-1.1l-4.3-2.5c-.4-.2-.9-.2-1.3 0l-4.4 2.5c-.4.3-.6.7-.6 1.2v5c0 .5.2.9.6 1.1l4.3 2.5c.4.2.9.2 1.3 0l3-1.7 2-1.2 3-1.7c.4-.2.9-.2 1.3 0l2.3 1.3c.4.2.6.7.6 1.1v2.7c0 .5-.2.9-.6 1.1l-2.3 1.4c-.4.2-.9.2-1.3 0l-2.3-1.4c-.4-.2-.6-.7-.6-1.1v-1.7l-2 1.2v1.7c0 .5.2.9.6 1.1l4.3 2.5c.4.2.9.2 1.3 0l4.3-2.5c.4-.2.6-.7.6-1.1v-5c0-.5-.2-.9-.6-1.1l-4.3-2.6z" fill="#fff" />
        </svg>
      );

    case 'bsc':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#F0B90B" />
          <path d="M12.1 16L9.6 18.5l-2.5-2.5L9.6 13.5zm3.9-3.9L19.9 8.2 22.4 10.7 18.5 14.6zM22.4 16l2.5 2.5-2.5 2.5-2.5-2.5zm-6.4 3.9l-3.9 3.9-2.5-2.5 3.9-3.9z" fill="#fff" />
          <path d="M18.5 16L16 18.5 13.5 16 16 13.5z" fill="#fff" />
        </svg>
      );

    case 'solana':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#0D0D0D" />
          <defs>
            <linearGradient id="sol-grad" x1="7" y1="24" x2="25" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9945FF" />
              <stop offset="0.5" stopColor="#19FB9B" />
              <stop offset="1" stopColor="#00D1FF" />
            </linearGradient>
          </defs>
          <path d="M9.5 20.5h11.2c.2 0 .3-.1.4-.2l1.4-1.4c.2-.2.1-.5-.2-.5H11.1c-.2 0-.3.1-.4.2l-1.4 1.4c-.2.2-.1.5.2.5z" fill="url(#sol-grad)" />
          <path d="M9.5 11.5h11.2c.2 0 .3.1.4.2l1.4 1.4c.2.2.1.5-.2.5H11.1c-.2 0-.3-.1-.4-.2L9.3 12c-.2-.2-.1-.5.2-.5z" fill="url(#sol-grad)" />
          <path d="M22.5 15.5H11.3c-.2 0-.3.1-.4.2l-1.4 1.4c-.2.2.1.5.2.5h11.2c.2 0 .3-.1.4-.2l1.4-1.4c.2-.2.1-.5-.2-.5z" fill="url(#sol-grad)" />
        </svg>
      );

    case 'bitcoin':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800" fontFamily="sans-serif">B</text>
        </svg>
      );

    case 'avalanche':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#E84142" />
          <path d="M11.3 22h-3c-.5 0-.8-.3-.8-.7 0-.2.1-.3.1-.4l7.6-13.2c.2-.4.6-.6 1-.6s.8.2 1 .6l1.6 2.8.1.2c.1.3 0 .6-.1.8l-5 8.7c-.2.4-.6.6-1 .6h-1.5zm10.1 0h-4l-.2-.1c-.3-.2-.4-.5-.3-.8l2-3.5c.2-.4.6-.6 1-.6s.8.2 1 .6l2 3.5.1.2c.1.3 0 .6-.3.8l-.2.1h-1.1z" fill="#fff" />
        </svg>
      );

    default:
      // Fallback: colored circle with abbreviation
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={r} cy={r} r={r} fill={meta.color} />
          <text
            x={r}
            y={r + (size < 20 ? 2 : 3)}
            textAnchor="middle"
            fill="#fff"
            fontSize={size < 20 ? 6 : size < 30 ? 8 : 10}
            fontWeight="700"
            fontFamily="'JetBrains Mono', monospace"
          >
            {meta.abbr.slice(0, 3)}
          </text>
        </svg>
      );
  }
}

export function ChainIcon({ chain, size = 'sm', showLabel = false }: ChainIconProps): ReactNode {
  const meta = getChainMeta(chain);
  const s = SIZES[size];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div style={{ width: s.box, height: s.box, borderRadius: size === 'xs' ? 4 : 6, overflow: 'hidden' }} className="shrink-0">
        <ChainSVG chain={chain} size={s.box} />
      </div>
      {showLabel && (
        <span style={{ fontSize: s.font + 3, color: '#e0e0f0', fontWeight: 600 }}>
          {meta.name}
        </span>
      )}
    </div>
  );
}
