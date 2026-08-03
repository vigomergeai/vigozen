// server/adPlatformIntegrations.js
// Real API clients for each advertising platform

const axios = require('axios');


/**
 * Base class for all ad platform integrations
 */
class BaseAdIntegration {
    constructor(config) {
        this.config = config;
        this.leadsImported = 0;
        this.lastSync = null;
        this.errors = [];
    }

    log(message, data = null) {
        console.log(`[${this.constructor.name}] ${message}`, data || '');
    }

    error(message, error = null) {
        console.error(`[${this.constructor.name}] ERROR: ${message}`, error || '');
        this.errors.push({ message, error: error?.message || error, timestamp: new Date() });
    }

    getStats() {
        return {
            leadsImported: this.leadsImported,
            lastSync: this.lastSync,
            errors: this.errors.slice(-10) // Last 10 errors
        };
    }
}

// ============================================================
// FACEBOOK LEAD INTEGRATION
// ============================================================
class FacebookLeadIntegration extends BaseAdIntegration {
    constructor(accessToken) {
        super({ accessToken });
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.facebook.com/v18.0';
        this.platform = 'facebook';
    }

    /**
     * Fetch lead forms for a page
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<Array>} List of lead forms
     */
    async fetchLeadForms(pageId) {
        try {
            this.log(`Fetching lead forms for page ${pageId}`);

            const response = await axios.get(`${this.baseUrl}/${pageId}/leadgen_forms`, {
                params: {
                    access_token: this.accessToken,
                    fields: 'id,name,status,created_time,questions'
                }
            });

            this.log(`Found ${response.data.data.length} lead forms`);
            return response.data.data;
        } catch (error) {
            this.error('Failed to fetch lead forms', error);
            throw new Error(`Facebook API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Fetch leads for a specific lead form
     * @param {string} formId - Lead form ID
     * @param {string} since - ISO date string for filtering
     * @returns {Promise<Array>} List of leads
     */
    async fetchLeads(formId, since = null) {
        try {
            const params = {
                access_token: this.accessToken,
                fields: 'id,created_time,field_data,page_id,ad_id,adgroup_id'
            };

            if (since) {
                params.since = since;
            }

            this.log(`Fetching leads for form ${formId}${since ? ` since ${since}` : ''}`);

            const response = await axios.get(`${this.baseUrl}/${formId}/leads`, { params });

            const leads = response.data.data || [];
            this.leadsImported += leads.length;
            this.lastSync = new Date().toISOString();

            this.log(`Fetched ${leads.length} leads from form ${formId}`);
            return leads;
        } catch (error) {
            this.error(`Failed to fetch leads for form ${formId}`, error);
            throw new Error(`Facebook API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Fetch all leads from all forms for a page
     * @param {string} pageId - Facebook Page ID
     * @param {string} since - ISO date string for filtering
     * @returns {Promise<Array>} Combined list of leads
     */
    async fetchAllLeads(pageId, since = null) {
        try {
            // First, get all lead forms
            const forms = await this.fetchLeadForms(pageId);

            if (forms.length === 0) {
                this.log('No lead forms found');
                return [];
            }

            // Fetch leads from each form
            const allLeads = [];
            for (const form of forms) {
                try {
                    const leads = await this.fetchLeads(form.id, since);
                    // Add form info to each lead
                    leads.forEach(lead => {
                        lead.form_id = form.id;
                        lead.form_name = form.name;
                    });
                    allLeads.push(...leads);
                } catch (error) {
                    this.error(`Failed to fetch leads for form ${form.id}`, error);
                    // Continue with other forms
                }
            }

            this.log(`Fetched ${allLeads.length} total leads from ${forms.length} forms`);
            return allLeads;
        } catch (error) {
            this.error('Failed to fetch all leads', error);
            throw error;
        }
    }
}

// ============================================================
// GOOGLE ADS INTEGRATION
// ============================================================
class GoogleAdsIntegration extends BaseAdIntegration {
    constructor(clientId, clientSecret, refreshToken = null) {
        super({ clientId, clientSecret, refreshToken });
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
        this.accessToken = null;
        this.baseUrl = 'https://googleads.googleapis.com/v18';
        this.platform = 'google';
    }

    /**
     * Get access token using refresh token
     * @returns {Promise<string>} Access token
     */
    async getAccessToken() {
        if (this.accessToken && this.accessTokenExpiry > Date.now()) {
            return this.accessToken;
        }

        try {
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            });

            this.accessToken = response.data.access_token;
            this.accessTokenExpiry = Date.now() + (response.data.expires_in * 1000);

            this.log('Access token refreshed successfully');
            return this.accessToken;
        } catch (error) {
            this.error('Failed to refresh access token', error);
            throw new Error(`Google OAuth Error: ${error.response?.data?.error_description || error.message}`);
        }
    }

    /**
     * Fetch leads from Google Ads
     * @param {string} customerId - Google Ads Customer ID
     * @param {string} since - ISO date string for filtering
     * @returns {Promise<Array>} List of leads
     */
    async fetchLeads(customerId, since = null) {
        try {
            const token = await this.getAccessToken();

            // Google Ads API query for lead data
            const query = `
        SELECT
          lead.id,
          lead.name,
          lead.email,
          lead.phone,
          lead.notes,
          lead.submit_time,
          lead.user_agent,
          lead.device,
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          ad.id,
          ad.name
        FROM lead
        WHERE lead.submit_time >= '${since || subDays(new Date(), 30).toISOString()}'
        ORDER BY lead.submit_time DESC
      `;

            this.log(`Fetching leads from Google Ads for customer ${customerId}`);

            const response = await axios.post(
                `${this.baseUrl}/customers/${customerId}/googleAds:search`,
                { query },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
                    }
                }
            );

            const leads = response.data.results || [];
            this.leadsImported += leads.length;
            this.lastSync = new Date().toISOString();

            this.log(`Fetched ${leads.length} leads from Google Ads`);
            return leads;
        } catch (error) {
            this.error('Failed to fetch leads from Google Ads', error);
            throw new Error(`Google Ads API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Get campaign performance metrics
     * @param {string} customerId - Google Ads Customer ID
     * @returns {Promise<Object>} Campaign metrics
     */
    async getCampaignMetrics(customerId) {
        try {
            const token = await this.getAccessToken();

            const query = `
        SELECT
          campaign.id,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM campaign
        WHERE campaign.status = 'ENABLED'
      `;

            const response = await axios.post(
                `${this.baseUrl}/customers/${customerId}/googleAds:search`,
                { query },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
                    }
                }
            );

            return response.data.results || [];
        } catch (error) {
            this.error('Failed to fetch campaign metrics', error);
            throw error;
        }
    }
}

// ============================================================
// LINKEDIN INTEGRATION
// ============================================================
class LinkedInIntegration extends BaseAdIntegration {
    constructor(accessToken) {
        super({ accessToken });
        this.accessToken = accessToken;
        this.baseUrl = 'https://api.linkedin.com/v2';
        this.platform = 'linkedin';
    }

    /**
     * Get ad accounts for the authenticated user
     * @returns {Promise<Array>} List of ad accounts
     */
    async getAdAccounts() {
        try {
            this.log('Fetching LinkedIn ad accounts');

            const response = await axios.get(`${this.baseUrl}/adAccounts`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    q: 'search',
                    'search.account.type': 'BUSINESS'
                }
            });

            return response.data.elements || [];
        } catch (error) {
            this.error('Failed to fetch ad accounts', error);
            throw new Error(`LinkedIn API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Fetch leads for a specific ad account
     * @param {string} accountId - LinkedIn Ad Account ID
     * @param {string} since - ISO date string for filtering
     * @returns {Promise<Array>} List of leads
     */
    async fetchLeads(accountId, since = null) {
        try {
            const params = {
                q: 'search',
                'search.account': `urn:li:sponsoredAccount:${accountId}`,
                count: 100
            };

            if (since) {
                const date = new Date(since);
                params['search.createdAt'] = `[${date.getTime()},${Date.now()}]`;
            }

            this.log(`Fetching LinkedIn leads for account ${accountId}`);

            const response = await axios.get(`${this.baseUrl}/leads`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                params
            });

            const leads = response.data.elements || [];
            this.leadsImported += leads.length;
            this.lastSync = new Date().toISOString();

            this.log(`Fetched ${leads.length} leads from LinkedIn`);
            return leads;
        } catch (error) {
            this.error('Failed to fetch leads from LinkedIn', error);
            throw new Error(`LinkedIn API Error: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Get campaign performance data
     * @param {string} accountId - LinkedIn Ad Account ID
     * @returns {Promise<Array>} Campaign data
     */
    async getCampaigns(accountId) {
        try {
            const response = await axios.get(`${this.baseUrl}/adCampaigns`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    q: 'search',
                    'search.account': `urn:li:sponsoredAccount:${accountId}`
                }
            });

            return response.data.elements || [];
        } catch (error) {
            this.error('Failed to fetch campaigns', error);
            throw error;
        }
    }
}

// ============================================================
// INSTAGRAM INTEGRATION
// ============================================================
class InstagramIntegration extends BaseAdIntegration {
    constructor(accessToken) {
        super({ accessToken });
        this.accessToken = accessToken;
        this.baseUrl = 'https://graph.facebook.com/v18.0';
        this.platform = 'instagram';
    }

    /**
     * Get Instagram business account ID
     * @param {string} instagramId - Instagram account ID
     * @returns {Promise<string>} Business account ID
     */
    async getBusinessAccountId(instagramId) {
        try {
            const response = await axios.get(`${this.baseUrl}/${instagramId}`, {
                params: {
                    access_token: this.accessToken,
                    fields: 'business_discovery.id,name,username'
                }
            });

            return response.data.business_discovery?.id || instagramId;
        } catch (error) {
            this.error('Failed to get business account ID', error);
            throw error;
        }
    }

    /**
     * Fetch leads from Instagram
     * Instagram uses Facebook's API for lead forms
     * @param {string} instagramId - Instagram account ID
     * @param {string} since - ISO date string for filtering
     * @returns {Promise<Array>} List of leads
     */
    async fetchLeads(instagramId, since = null) {
        try {
            // First get business ID
            const businessId = await this.getBusinessAccountId(instagramId);

            // Instagram leads come through Facebook Lead Forms
            const facebookIntegration = new FacebookLeadIntegration(this.accessToken);
            const leads = await facebookIntegration.fetchAllLeads(businessId, since);

            // Add Instagram platform marker
            leads.forEach(lead => {
                lead.platform = 'instagram';
                lead.instagram_id = instagramId;
            });

            this.leadsImported += leads.length;
            this.lastSync = new Date().toISOString();

            this.log(`Fetched ${leads.length} leads from Instagram`);
            return leads;
        } catch (error) {
            this.error('Failed to fetch leads from Instagram', error);
            throw new Error(`Instagram API Error: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Get Instagram account details
     * @param {string} instagramId - Instagram account ID
     * @returns {Promise<Object>} Account details
     */
    async getAccountDetails(instagramId) {
        try {
            const response = await axios.get(`${this.baseUrl}/${instagramId}`, {
                params: {
                    access_token: this.accessToken,
                    fields: 'id,username,name,profile_picture_url,media_count,followers_count'
                }
            });

            return response.data;
        } catch (error) {
            this.error('Failed to get account details', error);
            throw error;
        }
    }
}

// ============================================================
// LEAD MAPPER
// ============================================================
/**
 * Map platform-specific lead data to CRM lead format
 * @param {string} platform - Platform name (facebook, google, linkedin, instagram)
 * @param {Object} rawLead - Raw lead data from platform API
 * @returns {Object} Mapped lead in CRM format
 */
function mapPlatformLeadToCRM(platform, rawLead) {
    const baseLead = {
        platform: platform,
        platform_id: rawLead.id,
        created_at: rawLead.created_time || rawLead.submit_time || new Date().toISOString(),
        source: platform,
        status: 'new'
    };

    switch (platform) {
        case 'facebook':
        case 'instagram':
            return {
                ...baseLead,
                name: extractFacebookField(rawLead, 'full_name') || 'Unknown',
                email: extractFacebookField(rawLead, 'email') || '',
                phone: extractFacebookField(rawLead, 'phone_number') || '',
                company: extractFacebookField(rawLead, 'company_name') || '',
                message: extractFacebookField(rawLead, 'message') || '',
                form_id: rawLead.form_id,
                form_name: rawLead.form_name,
                page_id: rawLead.page_id,
                ad_id: rawLead.ad_id,
                adgroup_id: rawLead.adgroup_id,
                additional_data: rawLead.field_data || []
            };

        case 'google':
            return {
                ...baseLead,
                name: rawLead.lead?.name || 'Unknown',
                email: rawLead.lead?.email || '',
                phone: rawLead.lead?.phone || '',
                message: rawLead.lead?.notes || '',
                campaign_id: rawLead.campaign?.id,
                campaign_name: rawLead.campaign?.name,
                ad_group_id: rawLead.ad_group?.id,
                ad_group_name: rawLead.ad_group?.name,
                ad_id: rawLead.ad?.id,
                ad_name: rawLead.ad?.name,
                additional_data: {
                    user_agent: rawLead.lead?.user_agent,
                    device: rawLead.lead?.device
                }
            };

        case 'linkedin':
            return {
                ...baseLead,
                name: rawLead.lead?.person?.firstName + ' ' + rawLead.lead?.person?.lastName || 'Unknown',
                email: rawLead.lead?.emailAddress || '',
                phone: rawLead.lead?.phoneNumber || '',
                company: rawLead.lead?.companyName || '',
                message: rawLead.lead?.customNotes || '',
                account_id: rawLead.accountId,
                campaign_id: rawLead.campaignId,
                form_id: rawLead.formId,
                additional_data: {
                    job_title: rawLead.lead?.jobTitle,
                    industry: rawLead.lead?.industry
                }
            };

        default:
            // Generic mapping for unknown platforms
            return {
                ...baseLead,
                name: rawLead.name || rawLead.lead?.name || 'Unknown',
                email: rawLead.email || rawLead.lead?.email || '',
                phone: rawLead.phone || rawLead.lead?.phone || '',
                company: rawLead.company || rawLead.lead?.company || '',
                message: rawLead.message || rawLead.lead?.message || rawLead.notes || '',
                additional_data: rawLead
            };
    }
}

/**
 * Extract field from Facebook lead field_data array
 * @param {Object} rawLead - Facebook lead data
 * @param {string} fieldName - Field name to extract
 * @returns {string|null} Field value or null
 */
function extractFacebookField(rawLead, fieldName) {
    if (!rawLead.field_data || !Array.isArray(rawLead.field_data)) {
        return null;
    }

    const field = rawLead.field_data.find(f => f.name === fieldName);
    return field ? field.values?.[0] || null : null;
}

/**
 * Map multiple leads from a platform
 * @param {string} platform - Platform name
 * @param {Array} rawLeads - Array of raw lead objects
 * @returns {Array} Array of mapped leads
 */
function mapMultipleLeadsToCRM(platform, rawLeads) {
    if (!Array.isArray(rawLeads)) {
        return [];
    }

    return rawLeads
        .filter(lead => lead && typeof lead === 'object')
        .map(lead => mapPlatformLeadToCRM(platform, lead));
}

// ============================================================
// PLATFORM FACTORY
// ============================================================
/**
 * Create an integration instance for a specific platform
 * @param {string} platform - Platform name
 * @param {Object} credentials - Platform credentials
 * @returns {BaseAdIntegration} Integration instance
 */
function createPlatformIntegration(platform, credentials) {
    switch (platform.toLowerCase()) {
        case 'facebook':
            return new FacebookLeadIntegration(credentials.accessToken);
        case 'google':
            return new GoogleAdsIntegration(
                credentials.clientId,
                credentials.clientSecret,
                credentials.refreshToken
            );
        case 'linkedin':
            return new LinkedInIntegration(credentials.accessToken);
        case 'instagram':
            return new InstagramIntegration(credentials.accessToken);
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    // Classes
    FacebookLeadIntegration,
    GoogleAdsIntegration,
    LinkedInIntegration,
    InstagramIntegration,
    BaseAdIntegration,

    // Functions
    mapPlatformLeadToCRM,
    mapMultipleLeadsToCRM,
    extractFacebookField,
    createPlatformIntegration
};