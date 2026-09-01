/** Front page. Shown before the app opens. */

import { Link } from 'react-router-dom'
import { LogoLockup } from '../components/Logo.jsx'
import { DISCLAIMER } from '../lib/seed.js'

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-hero">
        <nav className="landing-nav" style={{ padding: '0 0 40px' }}>
          <Link to="/" className="brand" style={{ padding: 0, border: 0 }}>
            <LogoLockup size={38} />
          </Link>
          <div style={{ flex: 1 }} />
          <Link
            className="btn btn-sm"
            to="/app"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,.4)', color: '#fff' }}
          >
            Open the app
          </Link>
        </nav>

        <div className="landing-inner landing-hero-grid">
          <div>
            <h1>Know the WBGT. Know what to do.</h1>
            <p className="sub">
              Weather for your exact field, live radar, and the heat rules that tell you how long you can stay out and
              what the athletes can wear.
            </p>
            <div className="landing-cta">
              <Link className="btn btn-lg btn-primary" to="/app">Open the app</Link>
            </div>
          </div>

          <div className="hero-preview" aria-label="Example display">
            <div className="now-card lvl-orange" style={{ border: 0, boxShadow: 'none', borderRadius: 16 }}>
              <div className="now-main">
                <div>
                  <div className="now-temp">92<span className="deg">°F</span></div>
                  <div className="now-feels">Feels like 102°F</div>
                </div>
                <div className="now-wbgt">
                  <div className="wbgt-eyebrow">WBGT</div>
                  <div className="now-wbgt-value">88.8<span className="deg">°F</span></div>
                </div>
              </div>
              <div className="answer a-orange">
                <div className="answer-band">REDUCE TIME AND EQUIPMENT</div>
                <div className="answer-grid">
                  <div>
                    <div className="label">How long outside</div>
                    <div className="answer-big">2 hours maximum</div>
                  </div>
                  <div>
                    <div className="label">What to wear</div>
                    <div className="answer-big">Helmet, shoulder pads, shorts</div>
                  </div>
                </div>
                <div className="answer-note">Example display — not live data.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="landing-foot">
        <div className="landing-inner">
          <p style={{ maxWidth: '84ch' }}>{DISCLAIMER}</p>
          <p className="small" style={{ marginTop: 10 }}>
            Weather: Open-Meteo. Radar: RainViewer. Alerts: National Weather Service. Maps: OpenStreetMap.
          </p>
        </div>
      </footer>
    </div>
  )
}
