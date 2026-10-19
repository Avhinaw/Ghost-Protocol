export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="Loading Ghost Protocol">
      <div className="loading-stars" aria-hidden="true" />
      <div className="loading-hell-glow" aria-hidden="true" />
      <section className="loading-core">
        <div className="loading-core-orbit loading-core-orbit-one" aria-hidden="true" />
        <div className="loading-core-orbit loading-core-orbit-two" aria-hidden="true" />
        <div className="loading-core-drop" aria-hidden="true" />
        <div className="loading-brand"><span className="loading-brand-mark"><i /><i /></span><span>GHOST / PROTOCOL</span></div>
        <div className="loading-state"><span className="loading-live-dot" /> Establishing secure field</div>
        <div className="loading-bar" aria-hidden="true"><span /></div>
        <div className="loading-meta"><span>LOCAL NODE / 31337</span><span>PLEASE WAIT</span></div>
      </section>
    </main>
  );
}
