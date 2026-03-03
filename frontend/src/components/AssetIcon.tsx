import type { ReactNode } from 'react';

interface AssetIconProps {
  asset: string;
  size?: number;
}

export function AssetIcon({ asset, size = 18 }: AssetIconProps): ReactNode {
  switch (asset.toUpperCase()) {
    case 'ETH':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 4v9.2l7.8 3.5L16 4z" fill="#fff" opacity=".6" />
          <path d="M16 4L8.2 16.7 16 13.2V4z" fill="#fff" />
          <path d="M16 22.1v5.9l7.8-10.8L16 22.1z" fill="#fff" opacity=".6" />
          <path d="M16 28v-5.9l-7.8-4.9L16 28z" fill="#fff" />
        </svg>
      );

    case 'HYPE':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#00D4AA" />
          <path d="M16 6v6l5 2-5 2v6l8-10V8L16 6z" fill="#fff" />
        </svg>
      );

    case 'AVAX':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#E84142" />
          <path d="M16 8l4 8-4 8-4-8 4-8z" fill="#fff" />
        </svg>
      );

    case 'USDC':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <path d="M20.3 18.4c0-2.1-1.3-2.8-3.8-3.1-1.8-.3-2.2-.7-2.2-1.5s.7-1.3 1.8-1.3c1 0 1.6.4 1.9 1.1.1.1.2.2.3.2h1c.2 0 .3-.2.3-.3-.3-1.2-1.2-2-2.5-2.2V10c0-.2-.1-.3-.3-.3h-.8c-.2 0-.3.1-.3.3v1.3c-1.7.2-2.8 1.3-2.8 2.7 0 2 1.2 2.7 3.7 3 1.9.3 2.3.8 2.3 1.6 0 .9-.8 1.5-1.9 1.5-1.4 0-1.9-.6-2.1-1.3-.1-.2-.2-.2-.3-.2h-1c-.2 0-.3.2-.3.3.3 1.4 1.2 2.2 2.8 2.5V22c0 .2.1.3.3.3h.8c.2 0 .3-.1.3-.3v-1.3c1.8-.3 2.8-1.4 2.8-2.8z" fill="#fff" />
          <path d="M13 24.4c-4.5-1.6-6.8-6.6-5.2-11 .8-2.2 2.5-3.9 4.8-4.7.1-.1.2-.2.2-.3V7.3c0-.2-.1-.3-.3-.2-5.4 1.7-8.4 7.5-6.7 12.9 1 3.3 3.6 5.9 6.7 6.9.2.1.3 0 .3-.2v-1.1c.1-.1 0-.2-.2-.3h.4zm6-.1c.2-.1.3 0 .3.2v1.1c0 .2.1.3.3.2 5.4-1.7 8.4-7.5 6.7-12.9-1-3.3-3.6-5.9-6.7-6.9-.2-.1-.3 0-.3.2V7c0 .2.1.3.2.3 4.5 1.6 6.8 6.6 5.2 11-.8 2.2-2.6 3.9-4.8 4.7l.1 1.3z" fill="#fff" />
        </svg>
      );

    case 'USDT':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#26A17B" />
          <path d="M17.9 17.2v-.1c-.1 0-1.1-.1-2-.1s-1.7.1-1.9.1v.1c-3.4.2-6 .8-6 1.5s2.6 1.3 6 1.5v4.7h3.8v-4.7c3.4-.2 6-.8 6-1.5s-2.5-1.4-5.9-1.5zm-2 2.3c-4 0-7.2-.6-7.2-1.3s3.2-1.3 7.2-1.3 7.2.6 7.2 1.3-3.2 1.3-7.2 1.3z" fill="#fff" />
          <path d="M17.9 16.5v-3.1h4.7V9.8H9.4v3.6h4.7v3.1c-3.8.2-6.7.9-6.7 1.8s2.9 1.6 6.7 1.8v5.8h3.8v-5.8c3.8-.2 6.6-.9 6.6-1.8s-2.8-1.6-6.6-1.8z" fill="#fff" />
        </svg>
      );

    default:
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#555" />
          <text x="16" y="20" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700">{asset.slice(0, 3)}</text>
        </svg>
      );
  }
}
