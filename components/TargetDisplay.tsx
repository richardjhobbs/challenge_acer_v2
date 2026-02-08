interface TargetDisplayProps {
  digits: Array<{ value: string; locked: boolean }>;
  hint: string;
}

export default function TargetDisplay({ digits, hint }: TargetDisplayProps) {
  return (
    <div className="box targetBox">
      <div className="muted">Target</div>
      <div className="calc" aria-label="target display">
        {digits.map((digit, index) => (
          <div key={index} className={`calcDigit${digit.locked ? ' locked' : ''}`}>
            {digit.value}
          </div>
        ))}
      </div>
      <div className="smallNote">{hint}</div>
    </div>
  );
}
