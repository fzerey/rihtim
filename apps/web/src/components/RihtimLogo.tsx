import type { SVGProps } from "react";

export function RihtimLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="rihtim-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2b8fff" />
          <stop offset="100%" stopColor="#0f2a63" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#rihtim-logo-bg)" />
      <g fill="#eaf3ff">
        <rect x="12" y="15" width="16" height="10" rx="1.5" />
        <rect x="30" y="15" width="16" height="10" rx="1.5" />
        <rect x="21" y="27" width="16" height="10" rx="1.5" />
        <rect x="39" y="27" width="7" height="10" rx="1.5" />
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M8 46 Q16 42 24 46 T40 46 T56 46" stroke="#89caff" strokeWidth="3" />
        <path
          d="M8 54 Q16 50 24 54 T40 54 T56 54"
          stroke="#52aeff"
          strokeWidth="3"
          opacity="0.75"
        />
      </g>
    </svg>
  );
}
