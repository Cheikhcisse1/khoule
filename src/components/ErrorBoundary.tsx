import { Component, type ReactNode } from 'react';

/** Empêche une erreur d'affichage de vider toute l'application. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="alert alert-error">
        <span>Une erreur inattendue est survenue sur cette page.</span>
        <button className="btn btn-ghost" onClick={() => window.location.reload()}>Recharger</button>
      </div>
    );
  }
}
