// The LARPLE wordmark, top-left on inner pages. Clicking it goes back to the title screen.
export default function BrandHome({ onHome }: { onHome: () => void }) {
  return (
    <button className="brand-home" onClick={onHome} aria-label="Larple, back to home">
      <span className="brand-home-word">LARPLE</span>
      <span className="brand-home-tag">DOES HE KNOW?</span>
    </button>
  );
}
