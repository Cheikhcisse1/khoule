export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo ${light ? 'logo-light' : ''}`}>
      <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#188038" />
        <path d="M14 44V20l18 8 18-8v24l-18 8z" fill="#fbbc04" />
        <path d="M32 28v24" stroke="#188038" strokeWidth="3" />
      </svg>
      <span className="logo-text">
        Khoulé <em>Éducation</em>
      </span>
    </span>
  );
}
