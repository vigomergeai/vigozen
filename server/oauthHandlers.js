// server/oauthHandlers.js
// OAuth flow handlers for all ad platforms

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const pool = require('../db');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            error: "Access token required"
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("JWT ERROR in oauthHandlers:", err);
            return res.status(403).json({
                error: "Invalid token"
            });
        }
        req.user = user;
        next();
    });
};

// ============================================================
// CONFIGURATION
// ============================================================
const OAUTH_CONFIG = {
    facebook: {
        authorizeUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        scopes: ['leads_retrieval', 'pages_read_engagement', 'pages_manage_ads'],
        clientId: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:5000/api/oauth/facebook/callback'
    },
    google: {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/adwords'],
        clientId: process.env.GOOGLE_ADS_CLIENT_ID,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/oauth/google/callback'
    },
    linkedin: {
        authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: ['r_ads_leadgen_automation', 'r_ads_reporting', 'r_organization_social'],
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5000/api/oauth/linkedin/callback'
    },
    instagram: {
        authorizeUrl: 'https://api.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        scopes: ['instagram_basic', 'instagram_manage_insights', 'pages_read_engagement'],
        clientId: process.env.INSTAGRAM_APP_ID,
        clientSecret: process.env.INSTAGRAM_APP_SECRET,
        redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:5000/api/oauth/instagram/callback'
    }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Store OAuth state in session or database
 */
function storeOAuthState(userId, platform, state) {
    // In production, store in Redis or database
    // For now, use a simple in-memory store (will be lost on server restart)
    if (!global.oauthStates) {
        global.oauthStates = {};
    }
    global.oauthStates[state] = {
        userId,
        platform,
        timestamp: Date.now()
    };

    // Clean up old states (older than 10 minutes)
    const now = Date.now();
    Object.keys(global.oauthStates).forEach(key => {
        if (now - global.oauthStates[key].timestamp > 600000) {
            delete global.oauthStates[key];
        }
    });
}

/**
 * Get OAuth state from storage
 */
function getOAuthState(state) {
    if (!global.oauthStates) {
        return null;
    }
    return global.oauthStates[state] || null;
}

/**
 * Encrypt token for storage (simplified)
 */
function encryptToken(token) {
    // In production, use a proper encryption library
    return Buffer.from(token).toString('base64');
}

/**
 * Decrypt token for use (simplified)
 */
function decryptToken(encryptedToken) {
    return Buffer.from(encryptedToken, 'base64').toString('utf-8');
}

// ============================================================
// FACEBOOK OAUTH
// ============================================================

/**
 * Initiate Facebook OAuth flow
 * GET /api/oauth/facebook
 */
router.get('/facebook', authenticateToken, (req, res) => {
    try {
        const config = OAUTH_CONFIG.facebook;
        const state = generateState();

        // Store state with user info
        storeOAuthState(req.user.id, 'facebook', state);

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes.join(','),
            state: state,
            response_type: 'code',
            auth_type: 'rerequest'
        });

        const authUrl = `${config.authorizeUrl}?${params.toString()}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('Facebook OAuth init error:', error);
        res.status(500).json({ error: 'Failed to initiate Facebook OAuth' });
    }
});

/**
 * Facebook OAuth callback
 * GET /api/oauth/facebook/callback
 */
router.get('/facebook/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        // Check for errors
        if (error) {
            console.error('Facebook OAuth error:', error, error_description);
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=facebook_auth_failed`);
        }

        // Verify state
        const storedState = getOAuthState(state);
        if (!storedState || storedState.platform !== 'facebook') {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        // Exchange code for access token
        const config = OAUTH_CONFIG.facebook;
        const tokenResponse = await axios.get(config.tokenUrl, {
            params: {
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                code: code
            }
        });

        const { access_token, expires_in } = tokenResponse.data;

        // Get long-lived token
        const longLivedTokenResponse = await axios.get(
            'https://graph.facebook.com/v18.0/oauth/access_token',
            {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    fb_exchange_token: access_token
                }
            }
        );

        const longLivedToken = longLivedTokenResponse.data.access_token;

        // Get page ID and user info
        const userInfo = await axios.get('https://graph.facebook.com/v18.0/me', {
            params: {
                access_token: longLivedToken,
                fields: 'id,name,email,accounts{id,name,access_token,category}'
            }
        });

        // Store tokens securely in database
        try {
            const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

            await pool.query(
                `INSERT INTO ad_connections (user_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name, connected, status, created_at, updated_at)
                 VALUES ($1, 'facebook', $2, $3, $4, $5, $6, true, 'active', NOW(), NOW())
                 ON CONFLICT (user_id, platform) DO UPDATE SET
                 access_token = EXCLUDED.access_token,
                 refresh_token = EXCLUDED.refresh_token,
                 token_expires_at = EXCLUDED.token_expires_at,
                 account_id = EXCLUDED.account_id,
                 account_name = EXCLUDED.account_name,
                 updated_at = NOW()`,
                [storedState.userId, longLivedToken, longLivedToken, expiresAt, userInfo.data.id, userInfo.data.name]
            );

            console.log('Facebook tokens stored for user:', storedState.userId);
        } catch (dbError) {
            console.error('Failed to store Facebook tokens:', dbError);
        }

        // Redirect back to frontend with success
        res.redirect(
            `${process.env.FRONTEND_URL}/settings?connected=facebook&account_id=${userInfo.data.id}&account_name=${encodeURIComponent(userInfo.data.name)}`
        );
    } catch (error) {
        console.error('Facebook OAuth callback error:', error);
        const errorMessage = error.response?.data?.error?.message || error.message;
        res.redirect(`${process.env.FRONTEND_URL}/settings?error=facebook_auth_failed&message=${encodeURIComponent(errorMessage)}`);
    }
});

// ============================================================
// GOOGLE OAUTH
// ============================================================

/**
 * Initiate Google OAuth flow
 * GET /api/oauth/google
 */
router.get('/google', authenticateToken, (req, res) => {
    try {
        const config = OAUTH_CONFIG.google;
        const state = generateState();

        storeOAuthState(req.user.id, 'google', state);

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes.join(' '),
            state: state,
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent'
        });

        const authUrl = `${config.authorizeUrl}?${params.toString()}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('Google OAuth init error:', error);
        res.status(500).json({ error: 'Failed to initiate Google OAuth' });
    }
});

/**
 * Google OAuth callback
 * GET /api/oauth/google/callback
 */
router.get('/google/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('Google OAuth error:', error, error_description);
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=google_auth_failed`);
        }

        const storedState = getOAuthState(state);
        if (!storedState || storedState.platform !== 'google') {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        const config = OAUTH_CONFIG.google;
        const tokenResponse = await axios.post(config.tokenUrl, {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            code: code,
            grant_type: 'authorization_code'
        });

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // Get user info
        const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });

        // Store tokens in database
        try {
            const expiresAt = new Date(Date.now() + (expires_in * 1000));

            await pool.query(
                `INSERT INTO ad_connections (user_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name, connected, status, created_at, updated_at)
                 VALUES ($1, 'google', $2, $3, $4, $5, $6, true, 'active', NOW(), NOW())
                 ON CONFLICT (user_id, platform) DO UPDATE SET
                 access_token = EXCLUDED.access_token,
                 refresh_token = EXCLUDED.refresh_token,
                 token_expires_at = EXCLUDED.token_expires_at,
                 account_id = EXCLUDED.account_id,
                 account_name = EXCLUDED.account_name,
                 updated_at = NOW()`,
                [storedState.userId, access_token, refresh_token, expiresAt, userInfo.data.id, userInfo.data.name]
            );

            console.log('Google tokens stored for user:', storedState.userId);
        } catch (dbError) {
            console.error('Failed to store Google tokens:', dbError);
        }

        res.redirect(
            `${process.env.FRONTEND_URL}/settings?connected=google&account_id=${userInfo.data.id}&account_name=${encodeURIComponent(userInfo.data.name)}`
        );
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        const errorMessage = error.response?.data?.error_description || error.message;
        res.redirect(`${process.env.FRONTEND_URL}/settings?error=google_auth_failed&message=${encodeURIComponent(errorMessage)}`);
    }
});

// ============================================================
// LINKEDIN OAUTH
// ============================================================

/**
 * Initiate LinkedIn OAuth flow
 * GET /api/oauth/linkedin
 */
router.get('/linkedin', authenticateToken, (req, res) => {
    try {
        const config = OAUTH_CONFIG.linkedin;
        const state = generateState();

        storeOAuthState(req.user.id, 'linkedin', state);

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes.join(' '),
            state: state,
            response_type: 'code'
        });

        const authUrl = `${config.authorizeUrl}?${params.toString()}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('LinkedIn OAuth init error:', error);
        res.status(500).json({ error: 'Failed to initiate LinkedIn OAuth' });
    }
});

/**
 * LinkedIn OAuth callback
 * GET /api/oauth/linkedin/callback
 */
router.get('/linkedin/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('LinkedIn OAuth error:', error, error_description);
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=linkedin_auth_failed`);
        }

        const storedState = getOAuthState(state);
        if (!storedState || storedState.platform !== 'linkedin') {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        const config = OAUTH_CONFIG.linkedin;
        const tokenResponse = await axios.post(config.tokenUrl,
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                code: code,
                grant_type: 'authorization_code'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, expires_in, refresh_token } = tokenResponse.data;

        // Get user info
        const userInfo = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });

        // Get organization IDs
        const orgsResponse = await axios.get(
            'https://api.linkedin.com/v2/organizations?q=members&projection=(elements*(id,localizedName))',
            {
                headers: {
                    Authorization: `Bearer ${access_token}`
                }
            }
        );

        // Store tokens in database
        try {
            const expiresAt = new Date(Date.now() + (expires_in * 1000));
            const accountId = userInfo.data.sub;
            const accountName = userInfo.data.name;

            await pool.query(
                `INSERT INTO ad_connections (user_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name, connected, status, created_at, updated_at)
                 VALUES ($1, 'linkedin', $2, $3, $4, $5, $6, true, 'active', NOW(), NOW())
                 ON CONFLICT (user_id, platform) DO UPDATE SET
                 access_token = EXCLUDED.access_token,
                 refresh_token = EXCLUDED.refresh_token,
                 token_expires_at = EXCLUDED.token_expires_at,
                 account_id = EXCLUDED.account_id,
                 account_name = EXCLUDED.account_name,
                 updated_at = NOW()`,
                [storedState.userId, access_token, refresh_token, expiresAt, accountId, accountName]
            );

            console.log('LinkedIn tokens stored for user:', storedState.userId);
        } catch (dbError) {
            console.error('Failed to store LinkedIn tokens:', dbError);
        }

        res.redirect(
            `${process.env.FRONTEND_URL}/settings?connected=linkedin&account_id=${userInfo.data.sub}&account_name=${encodeURIComponent(userInfo.data.name)}`
        );
    } catch (error) {
        console.error('LinkedIn OAuth callback error:', error);
        const errorMessage = error.response?.data?.error_description || error.message;
        res.redirect(`${process.env.FRONTEND_URL}/settings?error=linkedin_auth_failed&message=${encodeURIComponent(errorMessage)}`);
    }
});

// ============================================================
// INSTAGRAM OAUTH
// ============================================================

/**
 * Initiate Instagram OAuth flow
 * GET /api/oauth/instagram
 */
router.get('/instagram', authenticateToken, (req, res) => {
    try {
        const config = OAUTH_CONFIG.instagram;
        const state = generateState();

        storeOAuthState(req.user.id, 'instagram', state);

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes.join(','),
            state: state,
            response_type: 'code'
        });

        const authUrl = `${config.authorizeUrl}?${params.toString()}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('Instagram OAuth init error:', error);
        res.status(500).json({ error: 'Failed to initiate Instagram OAuth' });
    }
});

/**
 * Instagram OAuth callback
 * GET /api/oauth/instagram/callback
 */
router.get('/instagram/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('Instagram OAuth error:', error, error_description);
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=instagram_auth_failed`);
        }

        const storedState = getOAuthState(state);
        if (!storedState || storedState.platform !== 'instagram') {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        const config = OAUTH_CONFIG.instagram;
        const tokenResponse = await axios.post(config.tokenUrl,
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                code: code,
                grant_type: 'authorization_code'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, user_id } = tokenResponse.data;

        // Get long-lived token
        const longLivedTokenResponse = await axios.get(
            'https://graph.instagram.com/access_token',
            {
                params: {
                    grant_type: 'ig_exchange_token',
                    client_secret: config.clientSecret,
                    access_token: access_token
                }
            }
        );

        const longLivedToken = longLivedTokenResponse.data.access_token;

        // Get user info
        const userInfo = await axios.get('https://graph.instagram.com/me', {
            params: {
                access_token: longLivedToken,
                fields: 'id,username,account_type,name'
            }
        });

        // Store tokens in database
        try {
            const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days for Instagram long-lived token

            await pool.query(
                `INSERT INTO ad_connections (user_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name, connected, status, created_at, updated_at)
                 VALUES ($1, 'instagram', $2, $3, $4, $5, $6, true, 'active', NOW(), NOW())
                 ON CONFLICT (user_id, platform) DO UPDATE SET
                 access_token = EXCLUDED.access_token,
                 refresh_token = EXCLUDED.refresh_token,
                 token_expires_at = EXCLUDED.token_expires_at,
                 account_id = EXCLUDED.account_id,
                 account_name = EXCLUDED.account_name,
                 updated_at = NOW()`,
                [storedState.userId, longLivedToken, longLivedToken, expiresAt, userInfo.data.id, userInfo.data.username]
            );

            console.log('Instagram tokens stored for user:', storedState.userId);
        } catch (dbError) {
            console.error('Failed to store Instagram tokens:', dbError);
        }

        res.redirect(
            `${process.env.FRONTEND_URL}/settings?connected=instagram&account_id=${userInfo.data.id}&account_name=${encodeURIComponent(userInfo.data.username)}`
        );
    } catch (error) {
        console.error('Instagram OAuth callback error:', error);
        const errorMessage = error.response?.data?.error?.message || error.message;
        res.redirect(`${process.env.FRONTEND_URL}/settings?error=instagram_auth_failed&message=${encodeURIComponent(errorMessage)}`);
    }
});

// ============================================================
// TOKEN REFRESH
// ============================================================

/**
 * Refresh OAuth token for a platform
 * POST /api/oauth/refresh
 */
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const { platform, refresh_token } = req.body;

        if (!platform || !refresh_token) {
            return res.status(400).json({ error: 'Platform and refresh_token are required' });
        }

        let tokenResponse;
        const config = OAUTH_CONFIG[platform.toLowerCase()];

        if (!config) {
            return res.status(400).json({ error: `Unsupported platform: ${platform}` });
        }

        switch (platform.toLowerCase()) {
            case 'facebook':
                tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: config.clientId,
                        client_secret: config.clientSecret,
                        fb_exchange_token: refresh_token
                    }
                });
                break;

            case 'google':
                tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    refresh_token: refresh_token,
                    grant_type: 'refresh_token'
                });
                break;

            case 'linkedin':
                tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken',
                    new URLSearchParams({
                        client_id: config.clientId,
                        client_secret: config.clientSecret,
                        refresh_token: refresh_token,
                        grant_type: 'refresh_token'
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                break;

            case 'instagram':
                tokenResponse = await axios.get('https://graph.instagram.com/refresh_access_token', {
                    params: {
                        grant_type: 'ig_refresh_token',
                        access_token: refresh_token
                    }
                });
                break;

            default:
                return res.status(400).json({ error: `Unsupported platform: ${platform}` });
        }

        res.json({
            success: true,
            platform: platform,
            tokens: tokenResponse.data
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Failed to refresh token',
            message: error.response?.data?.error_description || error.message
        });
    }
});

// ============================================================
// GET OAUTH URL (For frontend redirect)
// ============================================================

/**
 * Get OAuth URL for a platform (without redirecting)
 * GET /api/oauth/url/:platform
 */
router.get('/url/:platform', authenticateToken, (req, res) => {
    try {
        const { platform } = req.params;
        const config = OAUTH_CONFIG[platform.toLowerCase()];

        if (!config) {
            return res.status(400).json({ error: `Unsupported platform: ${platform}` });
        }

        const state = generateState();
        storeOAuthState(req.user.id, platform, state);

        let params;
        switch (platform.toLowerCase()) {
            case 'facebook':
                params = new URLSearchParams({
                    client_id: config.clientId,
                    redirect_uri: config.redirectUri,
                    scope: config.scopes.join(','),
                    state: state,
                    response_type: 'code'
                });
                break;

            case 'google':
                params = new URLSearchParams({
                    client_id: config.clientId,
                    redirect_uri: config.redirectUri,
                    scope: config.scopes.join(' '),
                    state: state,
                    response_type: 'code',
                    access_type: 'offline',
                    prompt: 'consent'
                });
                break;

            case 'linkedin':
                params = new URLSearchParams({
                    client_id: config.clientId,
                    redirect_uri: config.redirectUri,
                    scope: config.scopes.join(' '),
                    state: state,
                    response_type: 'code'
                });
                break;

            case 'instagram':
                params = new URLSearchParams({
                    client_id: config.clientId,
                    redirect_uri: config.redirectUri,
                    scope: config.scopes.join(','),
                    state: state,
                    response_type: 'code'
                });
                break;

            default:
                return res.status(400).json({ error: `Unsupported platform: ${platform}` });
        }

        const authUrl = `${config.authorizeUrl}?${params.toString()}`;

        res.json({
            success: true,
            platform: platform,
            authUrl: authUrl,
            state: state
        });
    } catch (error) {
        console.error('Get OAuth URL error:', error);
        res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }
});

// ============================================================
// REVOKE TOKEN
// ============================================================

/**
 * Revoke OAuth token for a platform
 * POST /api/oauth/revoke
 */
router.post('/revoke', authenticateToken, async (req, res) => {
    try {
        const { platform, token } = req.body;

        if (!platform || !token) {
            return res.status(400).json({ error: 'Platform and token are required' });
        }

        switch (platform.toLowerCase()) {
            case 'facebook':
                await axios.get('https://graph.facebook.com/v18.0/me/permissions', {
                    params: {
                        access_token: token
                    }
                });
                await axios.delete('https://graph.facebook.com/v18.0/me/permissions', {
                    params: {
                        access_token: token
                    }
                });
                break;

            case 'google':
                await axios.post('https://oauth2.googleapis.com/revoke',
                    new URLSearchParams({
                        token: token
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                break;

            case 'linkedin':
                await axios.post('https://api.linkedin.com/v2/oauth/revoke',
                    new URLSearchParams({
                        client_id: OAUTH_CONFIG.linkedin.clientId,
                        client_secret: OAUTH_CONFIG.linkedin.clientSecret,
                        token: token
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                break;

            case 'instagram':
                await axios.get('https://graph.instagram.com/me/permissions', {
                    params: {
                        access_token: token
                    }
                });
                break;

            default:
                return res.status(400).json({ error: `Unsupported platform: ${platform}` });
        }

        res.json({
            success: true,
            message: `Token revoked for ${platform}`
        });
    } catch (error) {
        console.error('Token revoke error:', error);
        res.status(500).json({
            error: 'Failed to revoke token',
            message: error.response?.data?.error_description || error.message
        });
    }
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = router;