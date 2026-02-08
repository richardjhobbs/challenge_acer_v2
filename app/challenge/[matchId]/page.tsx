interface MatchPageProps {
  params: { matchId: string };
}

export default function MatchPage({ params }: MatchPageProps) {
  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Acer Challenge</h1>
          <div className="muted">Match lobby placeholder.</div>
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
          <h2 style={{ marginTop: 0 }}>Match</h2>
          <p className="muted">Match ID: <span className="mono">{params.matchId}</span></p>
          <p className="muted">Online play will arrive here soon.</p>
        </div>
      </section>
    </div>
  );
}
