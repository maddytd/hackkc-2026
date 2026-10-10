// Shared microphone-on-a-stand illustration, used on the start screen and in the game.
export default function Mic({ className = '' }: { className?: string }) {
  return (
    <svg className={`mic ${className}`} viewBox="0 0 40 150" aria-hidden="true">
      {/* stand */}
      <line x1="20" y1="42" x2="20" y2="150" stroke="#0a0a0f" strokeWidth="4" />
      <line x1="20" y1="42" x2="20" y2="150" stroke="#3a3f4b" strokeWidth="2" />
      <ellipse cx="20" cy="149" rx="13" ry="3" fill="rgba(0,0,0,0.5)" />
      {/* mic head */}
      <rect x="12" y="6" width="16" height="30" rx="8" fill="#15171e" stroke="#4a5160" strokeWidth="1.5" />
      <rect x="14" y="9" width="12" height="18" rx="6" fill="#2a2f3a" />
      <line x1="14.5" y1="12" x2="25.5" y2="12" stroke="#565d6b" strokeWidth="1" />
      <line x1="14.5" y1="15" x2="25.5" y2="15" stroke="#565d6b" strokeWidth="1" />
      <line x1="14.5" y1="18" x2="25.5" y2="18" stroke="#565d6b" strokeWidth="1" />
      <line x1="14.5" y1="21" x2="25.5" y2="21" stroke="#565d6b" strokeWidth="1" />
    </svg>
  );
}
