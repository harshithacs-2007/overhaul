"use client";

import { Component, type ReactNode } from "react";

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg border border-steel/30 bg-navy p-8 text-paper">
          <p className="font-display text-2xl text-clay">Something went wrong</p>
          <p className="mt-3 text-sm text-steel">
            The retrofit engine hit an unexpected error. Reload and try again —
            no calculation data was lost on the server.
          </p>
          {this.state.message ? (
            <p className="mt-4 font-mono-num text-xs text-steel/80">
              {this.state.message}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-6 border border-teal px-4 py-2 text-sm text-teal hover:bg-teal/10"
            onClick={() => this.setState({ hasError: false, message: undefined })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
