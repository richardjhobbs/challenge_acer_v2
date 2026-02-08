export default function HowToPlay() {
  return (
    <details>
      <summary>How to play</summary>
      <div className="howto muted">
        <div>
          <b>Register:</b> pick a nickname, add a private email, and select an age band. No real names.
        </div>
        <div>
          <b>Daily set:</b> you get 10 challenges per day. Each round is one attempt.
        </div>
        <div>
          <b>Reveal:</b> choose the large-number count, then click <b>Reveal round</b> to flip the six tiles and roll the
          3-digit target.
        </div>
        <div>
          <b>Step mode:</b> pick a revealed number, choose an operation (+, -, ×, ÷), then pick the next number. The result
          becomes a new tile. Each tile can be used once per step.
        </div>
        <div>
          <b>Constraints:</b> intermediate results must be positive integers, division must be exact, no concatenation.
        </div>
        <div>
          <b>Timer:</b> the 60-second timer starts automatically after the target locks. Input stays locked until then.
        </div>
        <div>
          <b>Finish:</b> select the tile you want as your final answer, then press <b>Lock in your answer</b> before time
          runs out.
        </div>
        <div>
          <b>Scoring:</b> accuracy + time bonus per round. Ten rounds combine into today&apos;s score.
        </div>
      </div>
    </details>
  );
}
