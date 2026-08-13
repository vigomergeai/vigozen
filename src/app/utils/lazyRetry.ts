// ── LAZY LOAD RETRY UTILITY ──
// Automatically retries failed dynamic imports and clears stale chunks

export function lazyRetry(
    importFn: () => Promise<any>,
    maxRetries: number = 3,
    retryDelay: number = 1000
): () => Promise<any> {
    return async function retryableImport() {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Try to load the module
                const module = await importFn();
                return module;
            } catch (error: any) {
                lastError = error;

                // Check if this is a chunk loading failure
                const isChunkError =
                    error?.message?.includes('Failed to fetch dynamically imported module') ||
                    error?.message?.includes('Loading chunk') ||
                    error?.message?.includes('Importing a module script failed') ||
                    error?.message?.includes('Failed to load module script') ||
                    error?.message?.includes('404') ||
                    error?.message?.includes('NetworkError') ||
                    error?.message?.includes('Failed to fetch');

                if (isChunkError && attempt < maxRetries) {
                    console.warn(
                        `[lazyRetry] Chunk load failed (attempt ${attempt}/${maxRetries}), retrying...`
                    );

                    // Clear any stale module cache for the chunk
                    // This helps with Vite's HMR and chunk invalidation
                    if (typeof window !== 'undefined') {
                        // Clear specific chunk from cache if we know the URL
                        // @ts-ignore - accessing internal Vite state
                        if (window.__vite_plugin_react_preamble_installed__) {
                            // Vite dev mode - HMR handles this
                        }

                        // For production, clear the import map cache
                        // @ts-ignore
                        if (window.__vite_plugin_react_runtime__) {
                            // @ts-ignore
                            window.__vite_plugin_react_runtime__?.clear?.();
                        }
                    }

                    // Wait before retrying
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    continue;
                }

                // If it's not a chunk error or we've exhausted retries, throw
                throw error;
            }
        }

        // If we've exhausted all retries
        throw lastError;
    };
}

// ── CLEAR STALE CHUNKS ──
export function clearStaleChunks(): void {
    if (typeof window === 'undefined') return;

    try {
        // Clear Vite's module cache
        // @ts-ignore
        if (window.__vite_plugin_react_runtime__) {
            // @ts-ignore
            window.__vite_plugin_react_runtime__?.clear?.();
        }

        // Clear import map cache
        // @ts-ignore
        if (window.__vite_plugin_react_preamble_installed__) {
            // @ts-ignore
            window.__vite_plugin_react_preamble_installed__ = false;
        }

        // Clear session storage for chunks
        const keys = Object.keys(sessionStorage);
        keys.forEach((key) => {
            if (key.startsWith('vite:') || key.includes('chunk')) {
                sessionStorage.removeItem(key);
            }
        });

        // Clear localStorage for chunk versions
        const localKeys = Object.keys(localStorage);
        localKeys.forEach((key) => {
            if (key.includes('chunk') || key.includes('vite')) {
                localStorage.removeItem(key);
            }
        });

        console.log('[lazyRetry] Cleared stale chunks');
    } catch (error) {
        console.warn('[lazyRetry] Failed to clear stale chunks:', error);
    }
}

// ── LAZY LOAD WITH RETRY AND FALLBACK ──
export function lazyLoadWithRetry(
    importFn: () => Promise<any>,
    fallbackComponent?: React.ComponentType<any>
): () => Promise<any> {
    return async function loadWithRetry() {
        try {
            const module = await lazyRetry(importFn)();
            return module;
        } catch (error) {
            console.error('[lazyRetry] Failed to load module after retries:', error);

            // If fallback component provided, return it
            if (fallbackComponent) {
                return { default: fallbackComponent };
            }

            // Otherwise, re-throw
            throw error;
        }
    };
}

// ── CHECK IF CHUNK IS AVAILABLE ──
export function isChunkAvailable(chunkPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                resolve(false);
            }, 5000);

            fetch(chunkPath, {
                method: 'HEAD',
                signal: controller.signal,
            })
                .then((response) => {
                    clearTimeout(timeoutId);
                    resolve(response.ok);
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    resolve(false);
                });
        } catch {
            resolve(false);
        }
    });
}

// ── INVALIDATE CHUNK CACHE ──
export function invalidateChunkCache(): void {
    if (typeof window === 'undefined') return;

    try {
        // Clear all module cache
        // @ts-ignore
        if (window.__vite_plugin_react_runtime__) {
            // @ts-ignore
            window.__vite_plugin_react_runtime__?.clear?.();
        }

        // Clear import map cache
        // @ts-ignore
        if (window.__vite_plugin_react_preamble_installed__) {
            // @ts-ignore
            window.__vite_plugin_react_preamble_installed__ = false;
        }

        // Clear session storage
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
            if (key.startsWith('vite:') || key.includes('chunk') || key.includes('module')) {
                sessionStorage.removeItem(key);
            }
        });

        // Clear localStorage
        const localKeys = Object.keys(localStorage);
        localKeys.forEach((key) => {
            if (key.includes('chunk') || key.includes('vite') || key.includes('module')) {
                localStorage.removeItem(key);
            }
        });

        // Force reload of import map
        const importMap = document.querySelector('script[type="importmap"]');
        if (importMap) {
            // Trigger re-evaluation
            const newMap = importMap.cloneNode(true);
            importMap.parentNode?.replaceChild(newMap, importMap);
        }

        console.log('[lazyRetry] Chunk cache invalidated');
    } catch (error) {
        console.warn('[lazyRetry] Failed to invalidate chunk cache:', error);
    }
}

// ── LAZY LOAD WITH VERSION CHECK ──
export function lazyLoadWithVersionCheck(
    importFn: () => Promise<any>,
    appVersion: string = process.env.APP_VERSION || '1.0.0'
): () => Promise<any> {
    return async function loadWithVersionCheck() {
        try {
            // Check if version changed
            const storedVersion = localStorage.getItem('app_version');
            if (storedVersion && storedVersion !== appVersion) {
                console.warn('[lazyRetry] App version changed, clearing cache...');
                invalidateChunkCache();
                localStorage.setItem('app_version', appVersion);
            }

            // Store current version
            if (!storedVersion) {
                localStorage.setItem('app_version', appVersion);
            }

            return await lazyRetry(importFn)();
        } catch (error) {
            console.error('[lazyRetry] Failed to load module:', error);

            // If version mismatch, try one more time after clearing cache
            if (localStorage.getItem('app_version') !== appVersion) {
                invalidateChunkCache();
                localStorage.setItem('app_version', appVersion);
                return await lazyRetry(importFn)();
            }

            throw error;
        }
    };
}

export default lazyRetry;