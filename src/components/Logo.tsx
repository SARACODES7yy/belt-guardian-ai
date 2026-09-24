interface LogoProps {
  className?: string;
}

export const Logo = ({ className = "h-5 w-5" }: LogoProps) => (
  <svg viewBox="0 0 32 32" className={className} role="img" aria-label="ConveyorWatch logo">
    <defs>
      <linearGradient id="cw-logo-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3B82F6" />
        <stop offset="1" stopColor="#1E40AF" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#cw-logo-grad)" />
    <path
      d="M4 17 H8.5 L11.5 9.5 L15.5 22.5 L18.5 15 H21 L23 11 L25 17 H28"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="6" y="24.6" width="20" height="2.6" rx="1.3" fill="#FFFFFF" opacity="0.9" />
  </svg>
);
