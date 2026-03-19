import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-7 h-7 text-red-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-semibold text-white mb-1">Something went wrong</h3>
                        <p className="text-sm text-slate-400 max-w-md">
                            {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
                        </p>
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-slate-300 transition-colors border border-white/10"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
