import { useEffect, useState } from 'react'

// Lazy-load mermaid once, on the first diagram that mounts. Keeps the ~1.5MB
// library out of the initial bundle (Vite splits the dynamic import into its
// own chunk).
let mermaidPromise = null
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        flowchart: { curve: 'basis', htmlLabels: true },
        themeVariables: {
          darkMode: true,
          background: '#0a0f1c',
          fontSize: '14px',
          // nodes
          primaryColor: '#16203a',
          primaryBorderColor: '#2c3d68',
          primaryTextColor: '#e2e8f0',
          secondaryColor: '#1f2c4d',
          tertiaryColor: '#111a2e',
          // edges / lines
          lineColor: '#818cf8',
          // subgraph clusters
          clusterBkg: 'rgba(22, 32, 58, 0.4)',
          clusterBorder: '#2c3d68',
          // notes
          noteBkgColor: 'rgba(99, 102, 241, 0.12)',
          noteBorderColor: '#6366f1',
          noteTextColor: '#dbeafe',
          // sequence diagrams
          actorBkg: '#16203a',
          actorBorder: '#6366f1',
          actorTextColor: '#f1f5f9',
          actorLineColor: '#2c3d68',
          signalColor: '#94a3b8',
          signalTextColor: '#cbd5e1',
          labelBoxBkgColor: '#16203a',
          labelBoxBorderColor: '#2c3d68',
          labelTextColor: '#e2e8f0',
          loopTextColor: '#cbd5e1',
          activationBkgColor: '#1f2c4d',
          activationBorderColor: '#6366f1',
          // state diagrams
          stateBkg: '#16203a',
          stateBorder: '#2c3d68',
        },
      })
      return mermaid
    })
  }
  return mermaidPromise
}

// Module-level counter for globally-unique ids (useId chars break mermaid's
// internal CSS selectors).
let counter = 0

export default function MermaidDiagram({ code }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = 'mmd-' + ++counter

    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg)
          setError(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSvg('')
          setError(true)
        }
        // mermaid can leave an orphan temp node in <body> on parse failure
        document.getElementById('d' + id)?.remove()
        document.getElementById(id)?.remove()
      })

    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-label">⚠ diagram failed to render</div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  if (!svg) {
    return <div className="mermaid-diagram mermaid-loading" aria-hidden="true" />
  }

  return (
    <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
