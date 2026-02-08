export default function HowToPlay() {
  return (
    <details>
      <summary>How to play</summary>
      <div className="howto muted">
        <div>
          <b>Pick:</b> choose how many large numbers you want, then click <b>Reveal round</b>.
        </div>
        <div>
          <b>Reveal:</b> the six tiles flip over one-by-one, then the target display rolls and locks into a 3-digit number.
        </div>
        <div>
          <b>Step mode:</b> pick a revealed number, choose an operation (+, -, ×, ÷), then pick the next number. The result
          becomes a new tile. Each tile can be used once per step.
        </div>
        <div>
          <b>Constraints:</b> intermediate results must be positive integers, division must be exact, no concatenation.
        </div>
        <div>
          <b>Timer:</b> after the target is revealed, the timer announces and auto-starts after 10 seconds. Choose 30s,
          60s, or Unlimited.
        </div>
        <div>
          <b>Finish:</b> select the tile you want as your final answer, then press <b>Lock in your answer</b>.
        </div>
        <div>
          <b>Scoring:</b> exact match 10 points, 1–5 away 7 points, 6–10 away 5 points, otherwise 0.
        </div>
      </div>
    </details>
  );
}
