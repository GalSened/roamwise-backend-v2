# OSRM Setup Instructions

This document describes how to set up OSRM (Open Source Routing Machine) for RoamWise routing functionality.

## Local Development (Docker)

### 1. Prepare OSRM Data Directory

```bash
mkdir -p /Users/galsened/Downloads/osrm-data
cd /Users/galsened/Downloads/osrm-data
```

### 2. Download Map Data (One-time)

Download OpenStreetMap data for your region from [Geofabrik](https://download.geofabrik.de/):

```bash
# Israel & Palestine (adjust region as needed for your use case)
curl -O https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf

# Other popular regions:
# North America: https://download.geofabrik.de/north-america-latest.osm.pbf
# Europe: https://download.geofabrik.de/europe-latest.osm.pbf
# California: https://download.geofabrik.de/north-america/us/california-latest.osm.pbf
```

### 3. Process OSRM Data (One-time - takes ~5-10 minutes)

```bash
# Extract road network from OSM data
docker run --rm -t -v $PWD:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/israel-and-palestine-latest.osm.pbf

# Partition the road network for fast routing
docker run --rm -t -v $PWD:/data osrm/osrm-backend osrm-partition /data/israel-and-palestine-latest.osrm

# Customize the road network for driving profiles
docker run --rm -t -v $PWD:/data osrm/osrm-backend osrm-customize /data/israel-and-palestine-latest.osrm
```

**Note:** Processing time depends on the size of the region:
- Small region (city/state): ~1-2 minutes
- Medium region (country): ~5-10 minutes
- Large region (continent): ~30-60 minutes

### 4. Run OSRM Server

```bash
docker run -d --name osrm -p 5000:5000 -v $PWD:/data osrm/osrm-backend osrm-routed --port 5000 /data/israel-and-palestine-latest.osrm
```

### 5. Verify OSRM is Running

```bash
curl "http://localhost:5000/route/v1/driving/34.7818,32.0853;34.8000,32.0800?overview=false" | jq .code
# Expected: "Ok"
```

If you don't have `jq` installed, you can use:
```bash
curl "http://localhost:5000/route/v1/driving/34.7818,32.0853;34.8000,32.0800?overview=false"
# Expected JSON response with "code":"Ok"
```

## Management Commands

### Stop OSRM
```bash
docker stop osrm
```

### Start OSRM (after initial setup)
```bash
docker start osrm
```

### Check OSRM Status
```bash
docker ps | grep osrm
# Should show container status: Up
```

### View OSRM Logs
```bash
docker logs osrm
```

### Remove OSRM Container
```bash
docker rm -f osrm
```

### Restart with Fresh Data
```bash
docker stop osrm
docker rm osrm
# Then run step 4 again
```

## Environment Variables

Configure OSRM URL in backend via environment variables:

```bash
# .env or shell environment
OSRM_URL=http://localhost:5000
ROUTE_TIMEOUT_MS=12000
ROUTE_CACHE_TTL_MS=300000
ROUTE_CACHE_MAX=1000
```

## Production Deployment

### Option 1: Cloud Run (Google Cloud)

1. Build and push OSRM container with your region data:
```bash
# Create Dockerfile
cat > Dockerfile.osrm <<EOF
FROM osrm/osrm-backend
COPY israel-and-palestine-latest.osrm* /data/
CMD ["osrm-routed", "--port", "5000", "/data/israel-and-palestine-latest.osrm"]
EOF

# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/osrm-server .
gcloud run deploy osrm --image gcr.io/YOUR_PROJECT/osrm-server --platform managed --region us-central1 --allow-unauthenticated --port 5000
```

2. Set OSRM_URL in backend:
```bash
export OSRM_URL=https://osrm-XXXXX-uc.a.run.app
```

### Option 2: Compute Engine VM

```bash
# SSH into VM
gcloud compute ssh YOUR_VM_NAME

# Install Docker
curl -fsSL https://get.docker.com | sh

# Follow steps 1-4 from Local Development section

# Configure firewall to allow port 5000
gcloud compute firewall-rules create allow-osrm --allow tcp:5000
```

### Option 3: Managed Service (Fallback)

For production, consider using a managed routing API as fallback:
- Google Maps Directions API
- Mapbox Directions API
- GraphHopper API

Update `backend/routes/route.js` to try OSRM first, then fallback to managed service.

## Troubleshooting

### OSRM Container Won't Start
```bash
# Check Docker is running
docker ps

# Check logs
docker logs osrm

# Common issue: Port 5000 already in use
lsof -i :5000
# Kill the process using port 5000 or change OSRM port
```

### "No route found" Error
- Ensure origin/destination are within the map region you downloaded
- Verify coordinates are in the correct format: [lon, lat] for OSRM API
- Check OSRM logs for routing errors

### Slow First Request
- First route calculation after startup may be slower (loading data into memory)
- Subsequent requests should be fast (<100ms for local queries)

### Out of Memory
- Large regions (continents) may require more RAM
- Increase Docker memory limit in Docker Desktop settings
- Consider using a smaller region or splitting into multiple OSRM instances

## Performance Notes

- Local OSRM: ~50-100ms response time
- Cloud Run OSRM: ~200-500ms (includes network latency)
- Backend cache reduces load by ~80-90% (5 min TTL)
- Circuit breaker prevents cascading failures

## Security Notes

- OSRM container has no authentication by default
- For production, place behind VPC or use Cloud Run with authentication
- Never expose OSRM directly to the internet without auth/rate limiting
- Backend handles rate limiting and caching
