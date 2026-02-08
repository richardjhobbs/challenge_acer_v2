import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <h1>Acer Challenge</h1>
          <div className="muted">
            Register once, then play 10 timed rounds per day to post a daily score.
          </div>
        </div>
        <div className="topbarRight">
          <div className="muted">Desktop-only daily challenge experience.</div>
          <img
            className="headerLogo"
            src="/images/acer-can-winner-logo.png"
            alt="Acer Challenge logo"
            loading="eager"
          />
        </div>
      </div>

      <section className="stage landing">
        <div>
          <h2 style={{ margin: 0 }}>Welcome to Acer Challenge</h2>
          <p className="muted">
            Test your arithmetic under pressure. Register a nickname, tackle today&apos;s 10 puzzles, and compare your
            score against the Acer benchmark.
          </p>
        </div>

        <div className="ctaRow">
          <Link className="ctaButton" href="/solo">
            Play Solo
          </Link>
          <Link className="ctaButton btnGhost" href="/online">
            Online Challenge
          </Link>
        </div>
      </section>
    </div>
  );
}
