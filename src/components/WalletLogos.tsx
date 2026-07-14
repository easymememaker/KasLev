/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Crisp, self-contained wallet brand marks (inline SVG — no external assets, no
 * broken images offline). Each renders sharp from 24px up to 96px.
 */

/** The MetaMask fox — faithful geometric reconstruction of the official mark. */
export function MetaMaskLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 318.6 318.6" className={className} aria-label="MetaMask">
      {/* ears / top of head */}
      <polygon fill="#E2761B" stroke="#E2761B" points="274.1,35.5 174.6,109.4 193,65.8" />
      <polygon fill="#E4761B" stroke="#E4761B" points="44.4,35.5 143.1,110.1 125.6,65.8" />
      <polygon fill="#E4761B" stroke="#E4761B" points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7" />
      <polygon fill="#E4761B" stroke="#E4761B" points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8" />
      {/* face sides */}
      <polygon fill="#E4761B" stroke="#E4761B" points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1" />
      <polygon fill="#E4761B" stroke="#E4761B" points="214.9,138.2 176.4,103.4 174.6,164.6 230.8,162.1" />
      <polygon fill="#E4761B" stroke="#E4761B" points="106.8,247.4 140.6,230.9 111.4,208.1" />
      <polygon fill="#E4761B" stroke="#E4761B" points="177.9,230.9 211.8,247.4 207.1,208.1" />
      {/* jaw */}
      <polygon fill="#D7C1B3" stroke="#D7C1B3" points="211.8,247.4 177.9,230.9 180.6,253 180.3,262.3" />
      <polygon fill="#D7C1B3" stroke="#D7C1B3" points="106.8,247.4 138.3,262.3 138.1,253 140.6,230.9" />
      {/* eyes */}
      <polygon fill="#233447" stroke="#233447" points="138.8,193.5 110.6,185.2 130.5,176.1" />
      <polygon fill="#233447" stroke="#233447" points="179.7,193.5 188,176.1 208,185.2" />
      {/* brows */}
      <polygon fill="#CD6116" stroke="#CD6116" points="106.8,247.4 111.6,206.8 80.3,207.7" />
      <polygon fill="#CD6116" stroke="#CD6116" points="207,206.8 211.8,247.4 238.3,207.7" />
      <polygon fill="#CD6116" stroke="#CD6116" points="230.8,162.1 174.6,164.6 179.8,193.5 188.1,176.1 208.1,185.2" />
      <polygon fill="#CD6116" stroke="#CD6116" points="110.6,185.2 130.6,176.1 138.8,193.5 144.1,164.6 87.8,162.1" />
      {/* snout */}
      <polygon fill="#E4751F" stroke="#E4751F" points="87.8,162.1 111.4,208.1 110.6,185.2" />
      <polygon fill="#E4751F" stroke="#E4751F" points="208.1,185.2 207.1,208.1 230.8,162.1" />
      <polygon fill="#E4751F" stroke="#E4751F" points="144.1,164.6 138.8,193.5 145.4,227.6 146.9,182.7" />
      <polygon fill="#E4751F" stroke="#E4751F" points="174.6,164.6 171.9,182.6 173.1,227.6 179.8,193.5" />
      {/* mouth */}
      <polygon fill="#F6851B" stroke="#F6851B" points="179.8,193.5 173.1,227.6 177.9,230.9 207.1,208.1 208.1,185.2" />
      <polygon fill="#F6851B" stroke="#F6851B" points="110.6,185.2 111.4,208.1 140.6,230.9 145.4,227.6 138.8,193.5" />
      {/* chin */}
      <polygon fill="#C0AD9E" stroke="#C0AD9E" points="180.3,262.3 180.6,253 178.1,250.8 140.4,250.8 138.1,253 138.3,262.3 106.8,247.4 117.8,256.4 140.1,271.9 178.4,271.9 200.8,256.4 211.8,247.4" />
      <polygon fill="#161616" stroke="#161616" points="177.9,230.9 173.1,227.6 145.4,227.6 140.6,230.9 138.1,253 140.4,250.8 178.1,250.8 180.6,253" />
      {/* head base */}
      <polygon fill="#763D16" stroke="#763D16" points="278.3,114.2 286.8,73.4 274.1,35.5 177.9,106.9 214.9,138.2 267.2,153.5 278.8,140 273.8,136.4 281.8,129.1 275.6,124.3 283.6,118.2" />
      <polygon fill="#763D16" stroke="#763D16" points="31.8,73.4 40.3,114.2 34.9,118.2 42.9,124.3 36.8,129.1 44.8,136.4 39.8,140 51.3,153.5 103.6,138.2 140.6,106.9 44.4,35.5" />
      <polygon fill="#F6851B" stroke="#F6851B" points="267.2,153.5 214.9,138.2 230.8,162.1 207.1,208.1 238.3,207.7 284.8,207.7" />
      <polygon fill="#F6851B" stroke="#F6851B" points="103.6,138.2 51.3,153.5 33.9,207.7 80.3,207.7 111.4,208.1 87.8,162.1" />
      <polygon fill="#F6851B" stroke="#F6851B" points="174.6,164.6 177.9,106.9 193.1,65.8 125.6,65.8 140.6,106.9 144.1,164.6 145.3,182.8 145.4,227.6 173.1,227.6 173.3,182.8" />
    </svg>
  );
}

/** Kasware — Kaspa-native wallet: teal rounded badge with the angular Kaspa "K". */
export function KaswareLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Kasware">
      <defs>
        <linearGradient id="ksw-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#ksw-bg)" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* angular Kaspa-style K */}
      <path
        d="M22 16 L29 16 L29 28.5 L41 16 L49.5 16 L36.5 30 L36 32 L36.5 34 L49.5 48 L41 48 L29 35.5 L29 48 L22 48 Z"
        fill="#062e2a"
        opacity="0.92"
      />
      <path
        d="M22 16 L29 16 L29 28.5 L41 16 L49.5 16 L36.5 30 L36 32 L36.5 34 L49.5 48 L41 48 L29 35.5 L29 48 L22 48 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.75"
      />
    </svg>
  );
}

/** Kaspium — official Kaspa mobile wallet: deep-indigo badge, K-spiral mark. */
export function KaspiumLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="Kaspium">
      <defs>
        <linearGradient id="ksp-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#ksp-bg)" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* phone silhouette + K */}
      <rect x="20" y="12" width="24" height="40" rx="5" fill="rgba(9,13,22,0.85)" />
      <rect x="20" y="12" width="24" height="40" rx="5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <path d="M26 22 L30 22 L30 29 L36.5 22 L41.5 22 L34 30 L33.7 32 L34 34 L41.5 42 L36.5 42 L30 35 L30 42 L26 42 Z" fill="#a5b4fc" />
      <circle cx="32" cy="47" r="1.8" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}

/** KasLev's own mark for generic/manual sessions. */
export function KasLevMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="KasLev">
      <defs>
        <linearGradient id="klv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#134e4a" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#klv-bg)" />
      <path d="M18 44 L32 16 L38 28 L46 28 L32 52 L26 40 L18 40 Z" fill="#062e2a" opacity="0.9" />
    </svg>
  );
}
