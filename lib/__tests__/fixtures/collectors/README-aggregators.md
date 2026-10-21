# Collector fixtures (aggregators and keyless remote boards)

**All fixtures here are RECONSTRUCTED from documented response shapes, not captured live.** The build sandbox's outbound network is blocked (proxy CONNECT 403), and the keyed aggregators cannot be captured without keys. `npm run capture:fixtures` on the server replaces them with trimmed live captures (SERVER-CHECKS.md).

| File | Endpoint | Status |
| --- | --- | --- |
| `serpapi.json` | `GET https://serpapi.com/search.json?engine=google_jobs` | reconstructed (keyed) |
| `jsearch.json` | `GET https://jsearch.p.rapidapi.com/search` | reconstructed (keyed) |
| `theirstack.json` | `POST https://api.theirstack.com/v1/jobs/search` | reconstructed (keyed) |
| `jobspipe.json` | `GET {JOBSPIPE_BASE}/v1/jobs` | reconstructed (keyed); the endpoint itself is uncertain, see JOBSPIPE_BASE in collectors/jobspipe.ts |
| `remotive.json` | `GET https://remotive.com/api/remote-jobs` | reconstructed |
| `arbeitnow.json` | `GET https://www.arbeitnow.com/api/job-board-api` | reconstructed |
| `themuse.json` | `GET https://www.themuse.com/api/public/jobs` | reconstructed |
| `remoteok.json` | `GET https://remoteok.com/api` (first element is the legal notice) | reconstructed |
| `weworkremotely.rss` | `GET https://weworkremotely.com/remote-jobs.rss` | reconstructed (CDATA and entities on purpose) |
| `himalayas.json` | `GET https://himalayas.app/jobs/api` | reconstructed |
| `jobicy.json` | `GET https://jobicy.com/api/v2/remote-jobs` | reconstructed |

All company names, ids and URLs are fictional.
