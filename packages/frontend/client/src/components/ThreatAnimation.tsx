/* Ghost Protocol style: a tiny, non-graphic field vignette kept behind the glass workspace. */
export function ThreatAnimation() {
  return (
    <div className="threat-animation" aria-hidden="true">
      <div className="threat-ground" />
      <div className="threat-person person-a"><span className="person-head" /><span className="person-body" /><span className="person-arm arm-forward" /><span className="person-arm arm-back" /><span className="person-leg leg-left" /><span className="person-leg leg-right" /><span className="tiny-weapon" /></div>
      <span className="muzzle-flash" />
      <div className="threat-person person-b"><span className="person-head" /><span className="person-body" /><span className="person-arm arm-forward" /><span className="person-arm arm-back" /><span className="person-leg leg-left" /><span className="person-leg leg-right" /></div>
      <span className="dropped-phone"><span className="phone-screen" /></span>
      <div className="threat-person person-c"><span className="person-head" /><span className="person-body" /><span className="person-arm arm-forward" /><span className="person-arm arm-back" /><span className="person-leg leg-left" /><span className="person-leg leg-right" /></div>
      <span className="erase-signal"><span /><span /><span /></span>
    </div>
  );
}
