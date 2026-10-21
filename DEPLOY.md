# Deploying Opportunity Shield

The app is one Next.js server plus a SQLite file. It ships as a Docker image. Any host that can run a container and give it a writable `/data` directory will work.

| Option | Cost | Persistent memory | Notes |
|---|---|---|---|
| **A. Nebius Serverless AI endpoint** (recommended) | Per-second CPU VM billing; delete after judging | Yes (endpoint disk, or a shared filesystem) | App and models both run on Nebius: a strong story for this hackathon |
| B. Render (free web service) | Free | No (resets on redeploy or sleep) | Sleeps after inactivity, so the first request takes about a minute |
| C. Railway | ~$5/month trial credit | Yes (volume at `/data`) | Simplest setup with a persistent volume |

Every option uses the same image: `ghcr.io/<github-user>/opportunity-shield:latest`.

---

## 0. Build the image (GitHub Actions, no local Docker needed)

1. Create a **public** GitHub repository and push this project to `main`.
2. `.github/workflows/docker.yml` builds `linux/amd64` and pushes to GitHub Container Registry on every push to `main`. Check the run under **Actions → Docker image**.
3. GHCR packages are private by default. Open **your profile → Packages → opportunity-shield → Package settings → Change visibility → Public**. The alternative is to give the host registry credentials (see A.3).

`.github/workflows/ci.yml` runs typecheck, lint and the offline test suite on every push. The tests need no API keys.

## Environment variables

| Variable | Required | Value |
|---|---|---|
| `NEBIUS_API_KEY` | yes (secret) | Token Factory API key |
| `TAVILY_API_KEY` | yes (secret) | Tavily API key |
| `NEMOTRON_FAST_MODEL` | no | default `nvidia/Nemotron-3_5-Lightning` |
| `NEMOTRON_REASONING_MODEL` | no | default `nvidia/Nemotron-3-Ultra-550b-a55b` |
| `RATE_LIMIT_ANALYZE` | recommended | `12/60`: 12 live analyses per IP per hour. Cached results are free. |
| `RATE_LIMIT_SCAN` | recommended | `3/60` |
| `SCAN_MAX_LIMIT` | recommended | `6`: maximum deep analyses per scan |
| `SHIELD_DB_PATH` | no | default `/data/shield.db` in the image |
| `SHIELD_DB_JOURNAL` | no | `DELETE` if `/data` is a network/shared filesystem |
| `GITHUB_TOKEN` | no | raises the GitHub API limit from 60 to 5,000 requests per hour |

**Public-demo safety, already built in:**
- Each visitor gets their own memory (profile, history, blacklist, rules) through an anonymous `os_sid` cookie.
- Analyses are cached and shared only when the inputs are identical (same URL, profile, rules, blacklist and pipeline version).
- Rate limits count only live runs.
- `/api/health` reports whether each key is set, never the keys themselves.

---

## A. Nebius Serverless AI endpoint

Serverless AI runs a container image as an always-on endpoint with a managed HTTPS URL, billed per second. Docs: <https://docs.nebius.com/serverless/overview>.

### A.1 Prerequisites
- A Nebius AI Cloud project with a CPU VM quota. You need the Editor role in the project.
- The [Nebius CLI](https://docs.nebius.com/cli) installed and logged in. Check with `nebius iam whoami`.
- The image from step 0, public on GHCR.

### A.2 Store the API keys as secrets
In the console, store `NEBIUS_API_KEY` and `TAVILY_API_KEY` in **SecretStash**, so they never sit in shell history or the endpoint spec. You will pass their selectors with `--env-secret`.

### A.3 Create the endpoint

```bash
nebius ai endpoint create \
  --name opportunity-shield \
  --image ghcr.io/<github-user>/opportunity-shield:latest \
  --platform cpu-d3 \
  --preset <smallest cpu-d3 preset, e.g. 2vcpu-8gb> \
  --container-port 3000 \
  --disk-size 20Gi \
  --env "RATE_LIMIT_ANALYZE=12/60,RATE_LIMIT_SCAN=3/60,SCAN_MAX_LIMIT=6" \
  --env-secret "NEBIUS_API_KEY=<secretstash-selector>" \
  --env-secret "TAVILY_API_KEY=<secretstash-selector>"
```

Notes on the flags:
- **No `--auth` flag.** The demo must be public for judges. Add `--auth token` for a private staging copy.
- **Image visibility.** If the image is private, add `--registry-username <github-user> --registry-password <PAT with read:packages>`.
- **Volume (optional).** To keep memory across endpoint re-creation, mount a shared filesystem: `--volume <filesystem-id>:/data:rw`. Then add `SHIELD_DB_JOURNAL=DELETE` to `--env`.
- **Preset.** The CPU preset list is in the console under *create endpoint*. The docs example uses `4vcpu-16gb`, which is more than this app needs.

### A.4 Get the URL and check it

The HTTPS URL is in the endpoint's `status.public_endpoints`, also shown in the console. The subcommand names below follow the Nebius docs; `nebius ai endpoint --help` lists the exact ones for your CLI version.

```bash
nebius ai endpoint get-by-name --name opportunity-shield --format json | jq -r '.status.public_endpoints[] | select(startswith("https://"))'
curl -s https://<endpoint-url>/api/health
npm run warm -- https://<endpoint-url>   # pre-computes the 7 demo cases so judges get instant results
```

### A.5 Update and clean up
- **Ship a new version:** push to `main`, wait for the image workflow, then stop and start the endpoint (console, or `nebius ai endpoint stop|start`) so it pulls `latest` again.
- **After judging** (results due 15 December 2026): delete the endpoint. Billing stops when you delete it.

---

## B. Render (free)

1. On render.com, go to **New → Web Service** and connect the GitHub repo. Render detects the `Dockerfile`.
2. Set **Instance type** to Free and **Port** to `3000`.
3. Add the environment variables from the table above. Mark both keys as secret.
4. Deploy, then run `npm run warm -- https://<app>.onrender.com`.

Free instances sleep when idle, and the filesystem is ephemeral. The demo still works, but memory resets on each deploy and after sleep.

## C. Railway (persistent volume)

1. Create a **New Project** and choose **Deploy from GitHub repo**. Railway uses the `Dockerfile`.
2. Under **Variables**, add the table above.
3. Add a **Volume** mounted at `/data`.
4. Under **Settings → Networking**, choose **Generate Domain**, then run `npm run warm -- https://<app>.up.railway.app`.

---

## Local production run (no Docker)

```bash
npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/
cd .next/standalone && set -a && . ../../.env && set +a && SHIELD_DB_PATH=../../data/shield.db PORT=3000 node server.js
```
