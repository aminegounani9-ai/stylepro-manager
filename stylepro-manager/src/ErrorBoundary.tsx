import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
  details: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    details: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, details: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('STYLEPRO APP ERROR:', error)
    console.error('STYLEPRO COMPONENT STACK:', info.componentStack)

    this.setState({
      error,
      details: `${error.name}: ${error.message}\n\n${info.componentStack ?? ''}`,
    })
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{
          padding: 24,
          margin: '24px auto',
          maxWidth: 1000,
          fontFamily: 'monospace',
          color: '#7f1d1d',
          background: '#fff7f7',
          border: '1px solid #fecaca',
          borderRadius: 12,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}>
          <h2>StylePro Manager — Erreur de diagnostic</h2>
          <p>Copiez le message ci-dessous pour identifier la cause.</p>
          <pre>{this.state.details}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 16px', cursor: 'pointer' }}
          >
            Recharger l’application
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
