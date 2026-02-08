export default function HowToPlay() {
  return (
    <details>
      <summary>How to play</summary>
      <div className="howto muted">
        <div>
          <b>Register:</b> pick a nickname, add a private email, select an age band. No real names.
        </div>
        <div>
          <b>Daily set:</b> 5 challenges per day, one attempt each.
        </div>
        <div>
          <b>Reveal:</b> choose large-number count, click <b>Reveal round</b> to flip tiles and roll a 3-digit target.
        </div>
        <div>
          <b>Step mode:</b> pick a revealed number, choose operation (+, -, ×, ÷), pick next number. Each tile used once per
          step.
        </div>
        <div>
          <b>Constraints:</b> intermediate results must be positive integers. Division must be exact. No concatenation.
        </div>
        <div>
          <b>Timer:</b> 60-second timer starts automatically after target locks, input remains locked until then.
        </div>
        <div>
          <b>Finish:</b> pick the tile you want as your final answer, then press <b>Lock in your answer</b> before time
          runs out.
        </div>
        <div>
          <b>Scoring:</b> accuracy + time bonus per round. 5 rounds combine into today&apos;s score.
        </div>
      </div>
    </details>
  );
}
