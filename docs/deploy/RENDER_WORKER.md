# Render Worker Deploy

This repo includes a `render.yaml` Blueprint for the native worker.

## What it provisions

- Service name: `csvshape-worker`
- Service type: public Render web service
- Runtime: Docker
- Docker build context: repo root
- Dockerfile path: `apps/worker/Dockerfile`
- Health check path: `/health`
- Runtime port: `10000`
- Worker artifact TTL: `900`
- Native Miller: installed in the container via `apps/worker/Dockerfile`

## Deploy flow

1. Push `main` to GitHub.
2. Open the Render Blueprint flow for this repository.
3. Confirm the `csvshape-worker` service settings.
4. Apply the Blueprint.
5. Wait for the service to pass `/health`.
6. Record the resulting `onrender.com` URL in the QC docs.

## Notes

- The worker is modeled as a web service because it exposes an HTTP API at `/v1/run`.
- Local compose still uses port `8797`; Render uses `PORT=10000`.
- The worker image now installs the `mlr` binary so hosted health checks can expose real native Miller availability.
- Public hosted verification is not complete until the deployed Render URL is recorded and checked.
