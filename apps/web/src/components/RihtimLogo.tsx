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
      <rect x="17" y="16" width="30" height="16" rx="2.2" fill="#eaf3ff" />
      <path
        d="M23.5 20v8M29.5 20v8M35.5 20v8M41.5 20v8"
        stroke="#2f73d9"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="8" y="34" width="48" height="5" rx="1.6" fill="#eaf3ff" />
      <g fill="#89caff">
        <rect x="12.5" y="39" width="5" height="11" rx="1" />
        <rect x="29.5" y="39" width="5" height="11" rx="1" />
        <rect x="46.5" y="39" width="5" height="11" rx="1" />
      </g>
      <path
        d="M7 50 Q13.5 46.5 20 50 T33 50 T46 50 T57 49.5"
        fill="none"
        stroke="#52aeff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
