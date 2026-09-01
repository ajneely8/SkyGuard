/** Small shared presentation pieces. */

export function Card({ title, subtitle, actions, children, footer, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="small muted">{subtitle}</div>}
          </div>
          {actions && <div className="row" style={{ marginLeft: 'auto' }}>{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  )
}

export function Notice({ kind = 'info', title, children }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <div style={{ minWidth: 0 }}>
        {title && <h3>{title}</h3>}
        {children && <div className="small">{children}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children, id }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="small muted" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="muted small" style={{ padding: '18px 4px' }}>{children}</div>
}
