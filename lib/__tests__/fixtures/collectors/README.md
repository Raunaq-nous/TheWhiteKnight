# Collector fixtures (ATS)

**All fixtures in this directory are RECONSTRUCTED from documented response
shapes, not captured live.** A capture attempt on 2026-10-21 (one GET/POST per
ATS against public boards) failed because outbound network access from the
build sandbox is blocked (proxy CONNECT 403). The shapes follow the endpoints
in the product spec and the publicly documented / widely observed responses:

| File | Endpoint | Status |
| --- | --- | --- |
| `workday-page1.json` | `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (offset 20) | reconstructed; page 0 (20 postings, `total: 23`) is generated in the test from a template posting. Page 1 deliberately reports `total: 0`, mirroring tenants that only report total on offset 0. |
| `workable.json` | `GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true` | reconstructed |
| `recruitee.json` | `GET https://{slug}.recruitee.com/api/offers/` | reconstructed |
| `teamtailor.rss` | `GET https://{slug}.teamtailor.com/jobs.rss` | reconstructed (includes CDATA and HTML entities on purpose) |
| `personio.xml` | `GET https://{slug}.jobs.personio.de/xml?language=en` | reconstructed |
| `rippling.json` | `GET https://api.rippling.com/platform/api/ats/v1/board/{slug}/jobs` | reconstructed (array shape; the collector also accepts `{items}` / `{results}`) |

All company names, ids and URLs are fictional. Replace with trimmed live
captures when network access is available.
