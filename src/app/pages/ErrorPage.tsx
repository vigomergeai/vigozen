// ── ERROR PAGE (React Router errorElement) ──
import React, { useState, useEffect } from 'react';
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router';
import { clearStaleChunks } from '../utils/lazyRetry';

export default function ErrorPage() {
    const error = useRouteError();
    const navigate = useNavigate();
    const [showDetails, setShowDetails] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const handleReload = () => {
        try {
            clearStaleChunks();
        } catch (e) {
            // Ignore if lazyRetry not available
        }
        window.location.reload();
    };

    const handleGoHome = () => {
        navigate('/');
    };

    // Determine error type
    let statusCode = 500;
    let statusText = 'Internal Server Error';
    let message = 'Something went wrong while loading this page.';
    let isChunkError = false;
    let isNotFound = false;
    let isNetworkError = false;

    if (isRouteErrorResponse(error)) {
        statusCode = error.status;
        statusText = error.statusText;
        message = error.data?.message || error.data || 'The page could not be loaded.';
        isNotFound = statusCode === 404;
    } else if (error instanceof Error) {
        message = error.message;
        isChunkError =
            message.includes('Failed to fetch dynamically imported module') ||
            message.includes('Loading chunk') ||
            message.includes('Importing a module script failed') ||
            message.includes('Failed to load module script') ||
            message.includes('404') ||
            message.includes('NetworkError') ||
            message.includes('Failed to fetch');

        isNetworkError =
            message.includes('NetworkError') ||
            message.includes('Failed to fetch') ||
            message.includes('Network request failed');

        if (isChunkError) {
            statusText = 'Application Updated';
            message = 'The application has been updated. Please refresh to load the latest version.';
        } else if (isNetworkError) {
            statusText = 'Network Error';
            message = 'Unable to connect to the server. Please check your internet connection.';
        }
    }

    // Auto-reload countdown for chunk errors
    useEffect(() => {
        if (isChunkError) {
            setCountdown(5);
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        handleReload();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [isChunkError]);

    return (
        <div className="min-h-screen bg-[#020617] text-white flex flex-col">
            {/* Header */}
            <div className="bg-[#020617] border-b border-slate-800 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold flex items-center gap-2">
                            <span className={isNotFound ? 'text-yellow-400' : isNetworkError ? 'text-orange-400' : 'text-red-400'}>
                                {isNotFound ? '📄' : isNetworkError ? '🌐' : '⚠'}
                            </span>
                            {isNotFound ? 'Page Not Found' : isNetworkError ? 'Network Error' : 'Application Error'}
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            {isNotFound
                                ? 'The page you are looking for does not exist.'
                                : isNetworkError
                                    ? 'Unable to connect to the server.'
                                    : 'We encountered an error while loading this page.'}
                        </p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full ${isNotFound ? 'bg-yellow-900/30 text-yellow-400' :
                        isNetworkError ? 'bg-orange-900/30 text-orange-400' :
                            'bg-red-900/30 text-red-400'
                        }`}>
                        {statusCode}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex items-center justify-center px-6">
                <div className="max-w-xl text-center">
                    {isNotFound ? (
                        <div className="text-6xl mb-6">🔍</div>
                    ) : isNetworkError ? (
                        <div className="text-6xl mb-6">📡</div>
                    ) : isChunkError ? (
                        <div className="text-6xl mb-6 animate-bounce">🔄</div>
                    ) : (
                        <div className="text-6xl mb-6 animate-pulse">⚠️</div>
                    )}

                    <h2 className="text-2xl font-semibold mb-3">
                        {isNotFound ? 'Page Not Found' : statusText}
                    </h2>

                    <p className="text-slate-400 mb-6 text-sm leading-relaxed">{message}</p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        {isChunkError && countdown > 0 && (
                            <div className="text-sm text-slate-500 mb-2">
                                Auto-reloading in {countdown}...
                            </div>
                        )}
                        <button
                            onClick={handleReload}
                            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reload Application
                        </button>
                        <button
                            onClick={handleGoHome}
                            className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors font-medium text-sm"
                        >
                            {isNotFound ? 'Go to Dashboard' : 'Go Home'}
                        </button>
                    </div>

                    {/* Technical details */}
                    {error && !isNotFound && (
                        <div className="mt-6">
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                            >
                                {showDetails ? 'Hide technical details' : 'Show technical details'}
                            </button>
                            {showDetails && (
                                <div className="mt-3 text-left">
                                    <div className="bg-slate-900/50 rounded-lg p-4 overflow-auto max-h-48">
                                        <p className="text-xs font-mono text-red-400 break-all">
                                            {error instanceof Error ? error.message : String(error)}
                                        </p>
                                        {error instanceof Error && error.stack && (
                                            <p className="text-xs font-mono text-slate-500 mt-2 whitespace-pre-wrap max-h-32 overflow-auto">
                                                {error.stack}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <p className="text-xs text-slate-600 mt-6">
                        {isNotFound
                            ? 'Check the URL or navigate back to the dashboard.'
                            : isNetworkError
                                ? 'Please check your internet connection and try again.'
                                : 'If the problem persists, try clearing your browser cache or contact support.'}
                    </p>
                </div>
            </div>
        </div>
    );
}