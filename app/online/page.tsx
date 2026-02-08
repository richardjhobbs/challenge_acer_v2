export default function OnlinePage() {
  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Acer Challenge</h1>
          <div className="muted">Online Challenge is coming next.</div>
        </div>
        <div className="topbarRight">
          <img
            className="headerLogo"
            src="/images/acer-can-winner-logo.png"
            alt="Acer Challenge"
            loading="eager"
          />
        </div>
      </div>

      <section className="stage landing">
        <div className="placeholderBox">
          <h2 style={{ marginTop: 0 }}>Online Challenge is coming next</h2>
          <ul className="muted">
            <li>Real-time matchmaking and invites.</li>
            <li>Best of 3 rounds per match.</li>
            <li>Coin flip for first reveal.</li>
            <li>Seasonal leaderboard and stats.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
