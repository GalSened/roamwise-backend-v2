# Changelog

All notable changes to the RoamWise Backend project will be documented in this file.

## [Unreleased]

### Added
- Signed JWT tokens for family authentication sessions
- Secure cookie flags for production environment
- Environment variable validation with helpful error messages
- Graceful shutdown handling (SIGTERM/SIGINT)
- Comprehensive test suite with Vitest
- Constants files for magic numbers and configuration
- `.env.example` file for environment variable documentation
- API documentation with Swagger/OpenAPI
- Health metrics dashboard improvements
- Rate limiting for family authentication endpoints

### Changed
- Replaced base64-encoded session cookies with signed JWT tokens
- Migrated from console.log to structured logging (Pino)
- Updated README with correct port number (8080)
- Improved error handling consistency across all routes
- Enhanced security for production deployments

### Fixed
- Removed duplicate `/api/me` endpoint
- Fixed documentation inconsistencies
- Improved input validation across all endpoints

### Security
- Session cookies now cryptographically signed
- Secure flag enabled for cookies in production
- Removed sensitive data from logs
- Added rate limiting to prevent abuse

## [1.0.0] - 2025-10-21

### Initial Release
- Multi-tenant authentication system
- User profile management
- OSRM routing integration
- Google Places API integration
- Hazards API (weather + traffic)
- SQLite database with migrations
- Health monitoring dashboard
- Structured logging with Pino
- Circuit breaker pattern for external APIs
- LRU caching for performance
