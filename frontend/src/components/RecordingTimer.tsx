interface RecordingTimerProps {
  elapsed: number;
  total: number;
}

export default function RecordingTimer({ elapsed, total }: RecordingTimerProps) {
  const remaining = Math.max(0, Math.ceil(total - elapsed));
  const progress = Math.min(1, elapsed / total);
  return (
    <div className="timer" role="timer" aria-label={`${remaining} seconds remaining`}>
      <span className="timer-value">{remaining}s</span>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
