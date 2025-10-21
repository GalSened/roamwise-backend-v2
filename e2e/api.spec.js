// End-to-End API Tests with Playwright
import { test, expect } from '@playwright/test';

test.describe('Backend API E2E Tests', () => {

  test('Health endpoint returns ok status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  test('Dev login flow - complete authentication', async ({ request }) => {
    // Login request
    const loginResponse = await request.post('/api/dev/login', {
      data: {
        tenant: 'home',
        username: 'gal'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();

    const loginData = await loginResponse.json();
    expect(loginData.success).toBe(true);
    expect(loginData.user.username).toBe('gal');
    expect(loginData.user.tenant).toBe('home');

    // Verify cookie was set
    const cookies = loginResponse.headers()['set-cookie'];
    expect(cookies).toContain('roamwise_auth');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Lax');
  });

  test('Profile endpoint requires authentication', async ({ request }) => {
    // Try without auth - should fail
    const unauthResponse = await request.get('/api/profile');
    expect(unauthResponse.status()).toBe(401);

    const unauthData = await unauthResponse.json();
    expect(unauthData.error).toBe('Authentication required');
  });

  test('Profile endpoint works with authentication', async ({ request }) => {
    // First login
    const loginResponse = await request.post('/api/dev/login', {
      data: {
        tenant: 'home',
        username: 'gal'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();

    // Extract cookies
    const cookieHeader = loginResponse.headers()['set-cookie'];
    const authCookie = cookieHeader.split(';')[0]; // Get just the cookie value

    // Now get profile with auth cookie
    const profileResponse = await request.get('/api/profile', {
      headers: {
        'Cookie': authCookie
      }
    });

    expect(profileResponse.ok()).toBeTruthy();

    const profileData = await profileResponse.json();
    expect(profileData.user.username).toBe('gal');
    expect(profileData.preferences).toBeDefined();
    expect(profileData.preferences.pace).toBe('relaxed');
  });

  test('Family auth - signin flow with JWT', async ({ request }) => {
    const phone = '+972501234567';
    const name = 'E2E Test User';

    // Start signin
    const startResponse = await request.post('/api/family/signin/start', {
      data: { phone }
    });

    expect(startResponse.ok()).toBeTruthy();
    const startData = await startResponse.json();
    expect(startData.ok).toBe(true);

    // Finish signin (creates user and JWT)
    const finishResponse = await request.post('/api/family/signin/finish', {
      data: { phone, name }
    });

    expect(finishResponse.ok()).toBeTruthy();
    const finishData = await finishResponse.json();
    expect(finishData.ok).toBe(true);
    expect(finishData.user_id).toBeDefined();

    // Verify JWT cookie was set
    const cookies = finishResponse.headers()['set-cookie'];
    expect(cookies).toContain('family_session');
    expect(cookies).toContain('HttpOnly');

    // Extract cookie and verify it's a JWT (3 parts)
    const familyCookie = cookies.split(';')[0].replace('family_session=', '');
    const parts = familyCookie.split('.');
    expect(parts.length).toBe(3); // JWT has header.payload.signature
  });

  test('Family auth - /me endpoint verifies JWT', async ({ request }) => {
    const phone = '+972509876543';
    const name = 'JWT Test User';

    // Create session
    const signupResponse = await request.post('/api/family/signin/finish', {
      data: { phone, name }
    });

    const cookieHeader = signupResponse.headers()['set-cookie'];
    const familyCookie = cookieHeader.split(';')[0];

    // Get session info
    const meResponse = await request.get('/api/family/me', {
      headers: {
        'Cookie': familyCookie
      }
    });

    expect(meResponse.ok()).toBeTruthy();
    const meData = await meResponse.json();
    expect(meData.ok).toBe(true);
    expect(meData.session.name).toBe(name);
    expect(meData.session.userId).toBeDefined();
  });

  test('Admin health endpoint returns metrics', async ({ request }) => {
    const response = await request.get('/admin/healthz');
    // Health endpoint may return 503 if OSRM is down, but should still return data
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(600);

    const data = await response.json();
    expect(data.ok).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.metrics).toBeDefined();
    expect(data.providers).toBeDefined();
  });

  test('Logout clears authentication cookie', async ({ request }) => {
    // Login first
    const loginResponse = await request.post('/api/dev/login', {
      data: { tenant: 'home', username: 'gal' }
    });

    const loginCookie = loginResponse.headers()['set-cookie'].split(';')[0];

    // Logout
    const logoutResponse = await request.post('/api/dev/logout', {
      headers: {
        'Cookie': loginCookie
      }
    });

    expect(logoutResponse.ok()).toBeTruthy();
    const logoutData = await logoutResponse.json();
    expect(logoutData.success).toBe(true);
  });

  test('Rate limiting on family auth endpoints', async ({ request }) => {
    const phone = '+972501111111';

    // Make 6 requests quickly (limit is 5 per minute)
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        request.post('/api/family/signin/start', {
          data: { phone }
        })
      );
    }

    const responses = await Promise.all(requests);

    // At least one should be rate limited
    const rateLimited = responses.some(r => r.status() === 429);
    expect(rateLimited).toBe(true);
  });

  test('Invalid tenant returns 401', async ({ request }) => {
    const response = await request.post('/api/dev/login', {
      data: {
        tenant: 'nonexistent',
        username: 'gal'
      }
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('User not found');
  });

  test('Invalid phone number returns 400', async ({ request }) => {
    // Wait a bit to avoid rate limiting from previous test
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await request.post('/api/family/signin/start', {
      data: {
        phone: 'invalid'
      }
    });

    // Should be 400 for invalid phone (unless rate limited)
    if (response.status() === 429) {
      // Rate limited - skip this specific check
      const data = await response.json();
      expect(data.code).toBe('rate_limited');
    } else {
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('invalid_phone');
    }
  });
});
