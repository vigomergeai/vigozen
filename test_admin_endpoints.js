const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
    console.log('Starting Admin Panel Endpoint Tests...');
    let token = '';
    let testUserId = '';

    // 1. Test Login
    try {
        console.log('\n--- 1. Testing Login ---');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'orgadmin@vigozen.com',
            password: 'Password123!'
        });
        token = loginRes.data.token;
        console.log('✅ Login successful!');
        console.log('User Role:', loginRes.data.user.role);
        console.log('Token length:', token.length);
    } catch (err) {
        console.error('❌ Login failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // 2. Test Get Visible Users (Subscriptions Tab Data Source)
    try {
        console.log('\n--- 2. Testing Get Visible Users (/users/visible) ---');
        const usersRes = await axios.get(`${BASE_URL}/users/visible`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Visible Users fetched successfully!');
        console.log(`Fetched ${usersRes.data.length} users.`);
        if (usersRes.data.length > 0) {
            testUserId = usersRes.data[0].id;
            console.log(`Using User ID ${testUserId} (${usersRes.data[0].name}) for subscription update test.`);
            console.log('First User Details:', {
                name: usersRes.data[0].name,
                email: usersRes.data[0].email,
                subscription_status: usersRes.data[0].subscription_status,
                plan_type: usersRes.data[0].plan_type
            });
        }
    } catch (err) {
        console.error('❌ Fetching visible users failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // 3. Test Get Audit Logs
    try {
        console.log('\n--- 3. Testing Fetch Audit Logs (/api/audit-logs) ---');
        const logsRes = await axios.get(`${BASE_URL}/api/audit-logs?limit=5`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Audit logs fetched successfully!');
        console.log(`Fetched ${logsRes.data.length} logs.`);
        if (logsRes.data.length > 0) {
            console.log('Sample Log:', {
                user_name: logsRes.data[0].user_name,
                action: logsRes.data[0].action,
                entity_type: logsRes.data[0].entity_type,
                created_at: logsRes.data[0].created_at
            });
        } else {
            console.log('No audit logs returned (table might be empty, but query executed successfully).');
        }
    } catch (err) {
        console.error('❌ Fetching audit logs failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // 4. Test Subscription Status Update
    if (testUserId) {
        try {
            console.log('\n--- 4. Testing Subscription Status Update (/users/:id/subscription) ---');
            // Update status to active
            console.log('Updating subscription status to active...');
            let updateRes = await axios.put(`${BASE_URL}/users/${testUserId}/subscription`,
                { subscription_status: 'active' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('✅ Subscription status updated to active successfully!');
            console.log('Updated User Details:', updateRes.data);

            // Update status back to trialing (or keep active)
            console.log('Reverting subscription status to trialing...');
            updateRes = await axios.put(`${BASE_URL}/users/${testUserId}/subscription`,
                { subscription_status: 'trialing' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('✅ Subscription status reverted to trialing successfully!');
            console.log('Final User Details:', updateRes.data);
        } catch (err) {
            console.error('❌ Updating subscription status failed:', err.response?.data || err.message);
            process.exit(1);
        }
    }

    console.log('\n======================================');
    console.log('🎉 All Admin Panel endpoints are working perfectly!');
    console.log('======================================');
    process.exit(0);
}

runTests();
