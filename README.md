# RoamWise Backend

Multi-tenant authentication and user profile backend for RoamWise (dev/home use).

## Features

- **Multi-tenant authentication** - Support for 4-5 tenants (families/groups)
- **Dev login** - Choose tenant + user, no password required
- **User profiles** - Travel preferences (pace, likes, avoid, dietary, budget)
- **JWT authentication** - HttpOnly cookies with 7-day expiration
- **SQLite database** - Embedded database with migrations and seed data
- **Namespaced storage** - Per-tenant/per-user isolation

## Prerequisites

- Node.js 18+ (ES modules required)
- npm 8+

## Installation

```bash
cd backend
npm install
```

## Running

### Development (auto-restart on changes)
```bash
npm run dev
```

### Production
```bash
npm start
```

The server runs on **http://localhost:3000** by default.

## Database

### Schema
- **tenants** - Tenant organizations (home, work, etc.)
- **users** - Users belonging to tenants
- **profiles** - User preferences and travel settings

### Migrations
Migrations run automatically on server startup. Database file: `backend/roamwise.db`

### Seed Data
Default tenant: **home**
- **gal** - Main user
- **guest** - Guest account
- **family1** - Family member 1
- **family2** - Family member 2

Each user has default preferences (pace: moderate, budget: $50-$500, etc.)

## API Endpoints

### Authentication

#### POST /api/dev/login
Dev login (no password required)

**Request:**
```json
{
  "tenant": "home",
  "username": "gal"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "gal",
    "displayName": "Gal",
    "tenant": "home"
  }
}
```

Sets `roamwise_auth` HttpOnly cookie with JWT token.

#### POST /api/dev/logout
Logout (clears auth cookie)

**Response:**
```json
{
  "success": true
}
```

#### GET /api/dev/tenants
Get list of available tenants

**Response:**
```json
{
  "tenants": [
    { "id": 1, "name": "home" }
  ]
}
```

#### GET /api/dev/users/:tenantId
Get users for a tenant

**Response:**
```json
{
  "users": [
    { "id": 1, "username": "gal", "display_name": "Gal" }
  ]
}
```

### Profile (requires authentication)

#### GET /api/profile
Get current user's profile

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "gal",
    "displayName": "Gal",
    "tenant": "home"
  },
  "preferences": {
    "pace": "moderate",
    "likes": ["food", "culture", "nature"],
    "avoid": ["crowds"],
    "dietary": [],
    "budget": {
      "min": 50,
      "max": 500
    }
  }
}
```

#### PUT /api/profile
Update user preferences

**Request:**
```json
{
  "pace": "fast",
  "likes": ["food", "adventure"],
  "avoid": ["crowds", "shopping"],
  "dietary": ["vegetarian"],
  "budget": {
    "min": 100,
    "max": 1000
  }
}
```

**Response:**
```json
{
  "success": true,
  "preferences": { /* updated preferences */ }
}
```

### Routing (OSRM integration)

#### POST /api/route
Compute route between stops using OSRM (Open Source Routing Machine).

**Request:**
```json
{
  "stops": [
    { "lat": 32.0853, "lon": 34.7818 },
    { "lat": 32.0800, "lon": 34.8000 }
  ],
  "mode": "drive"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "distance_m": 1234,
  "duration_s": 180,
  "geometry": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "LineString",
        "coordinates": [[34.7818, 32.0853], [34.7820, 32.0855], ...]
      }
    }]
  }
}
```

**Response (Provider Unavailable):**
```json
{
  "ok": false,
  "code": "provider_unavailable",
  "message": "Route provider temporarily unavailable"
}
```

**Features:**
- LRU cache (1000 entries, 5 min TTL by default)
- Timeout protection (12s default)
- Circuit breaker (opens on repeated failures)
- GeoJSON LineString response format
- Graceful degradation when OSRM is offline

**OSRM Setup:**
See [OSRM-SETUP.md](./OSRM-SETUP.md) for instructions on running OSRM with Docker.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret for JWT signing (default: dev secret, **change in production**)
- `OSRM_URL` - OSRM server URL (default: http://localhost:5000)
- `ROUTE_TIMEOUT_MS` - Route request timeout in milliseconds (default: 12000)
- `ROUTE_CACHE_TTL_MS` - Route cache TTL in milliseconds (default: 300000 = 5 min)
- `ROUTE_CACHE_MAX` - Max number of cached routes (default: 1000)

Example:
```bash
PORT=3001 JWT_SECRET=your-secret-here OSRM_URL=http://localhost:5000 npm start
```

See `.env.example` for a complete list of environment variables.

## Frontend Integration

The frontend at **http://localhost:8080** is configured to connect to this backend with:
- CORS enabled for localhost origins
- Credentials (cookies) included in requests
- Namespaced localStorage per tenant/user

See `src/lib/api-auth.js` and `src/lib/kv.js` in the frontend for integration details.

## Architecture

### Data Flow
1. User selects tenant + user in DevLogin UI
2. Frontend calls `/api/dev/login`, receives JWT cookie
3. Frontend sets localStorage namespace (`tenant:username`)
4. Frontend calls `/api/profile` to load preferences
5. Preferences flow into Context Engine → Recommender for personalization

### Isolation
- **Database** - Each user has separate profile row
- **localStorage** - Namespaced keys (`home:gal:copilot`, `home:guest:copilot`)
- **Bandit memory** - Per-user acceptance/rejection counts
- **Flags** - Per-user feature flags

### Security Notes
**This backend is for dev/home use only**:
- No password authentication (dev convenience)
- JWT secret should be changed for production
- Not hardened for public internet exposure
- Designed for trusted local network (4-5 users max)

For production deployment, add:
- Password-based authentication
- HTTPS/TLS
- Rate limiting
- Input sanitization
- Security headers
- Environment-based secrets

## Troubleshooting

### Server won't start
- Check Node.js version (18+ required)
- Delete `node_modules` and run `npm install` again
- Check port 3000 is not in use: `lsof -i :3000`

### Frontend can't connect
- Verify backend is running on port 3000
- Check browser console for CORS errors
- Verify frontend is running on localhost:8080

### Database issues
- Delete `backend/roamwise.db` to reset (migrations will recreate)
- Check file permissions on database file

## License

Part of RoamWise project - Internal use
