# KOKI-FROZEN-BASELINE-20260828-0844

Status: FROZEN / IMMUTABLE BASELINE
Captured: 2026-08-28 Europe/Sofia
Purpose: exact reference point for the current working KOKI before any subsequent integration work.

## Source
- Repository: `8prp2dj62b-byte/koki-ui-playground`
- Frozen branch: `freeze/koki-working-20260828-0844`
- Origin commit: `aa1647da447abfa1dc0778c8e6726ee98f516d88`
- Live/default branch was not modified by creation of this baseline.

## Supabase production snapshot
- Project: `aqhdzfsspmuvadnlchvj`
- DB snapshot captured: `2026-08-28T05:51:49.041591+00:00`
- Public tables: `139`
- Public columns: `1670`
- Public indexes: `342`
- Public RLS policies: `14`
- Public functions: `211`
- Canonical schema fingerprint (MD5): `edfe99d15fa4f146bb75636095bb6746`

### Active production Edge Functions pinned by version + SHA256

| Function | Version | SHA256 |
|---|---:|---|
| olx-login | 23 | b80bdde06e7669534b9d0a0da64a4db157fb2b175d4f3d7fc8aa3f14da602530 |
| olx-callback | 49 | 26352b0db37633120e147dcd75ccc7a6515109409f87e1a91a3ea823623cd642 |
| olx-api | 18 | e82d5c2fb185bdb384d30a83f7191baae58127578a9a72c741d8d31e0c77b602 |
| olx-diagnostic | 28 | edc17427f3f201c2cbb9bf69cae96af4009b1d7c59adc7760c9dd66603ea4f8f |
| koki-negotiator | 40 | 7286329aec9a6f265ef1f063bd3b04a7a57b46a197dfb89b712ceb58a56d497d |
| koki-live | 16 | 4ae3dab1084578734b692349fd2dccae9b123d11a0db95e085eee0c8ed66d585 |
| koki-chat | 17 | 3dadf7a7de2958e326c7ab61b5223747f7b703e374772c77a83d1d9f1b9ee674 |
| koki-market-intelligence | 20 | 34b1e502c3ea8151525528ed31750e8cbda0e4cbc6883da78d7301c388ea044b |
| koki-master-brain | 24 | 1a2e6b1e1a34e988a4158dc853be891fdbb0af13f58d70ca960e3c60c3f241c4 |
| koki-command-center | 155 | ba1695fdcfed72376952d903322a7a4c245a6acd5c0e1dec299bbaeb598869e5 |
| koki-takeover | 38 | 7dc57795a15dffdc426e3ff72b6d72519a794fc425bac3de53d350b7c8e0edf7 |
| koki-language | 33 | 8584569ea27fd255d3a883a992437fb21f59bd0923f60eb251e5bf82c52cf406 |
| koki-negotiator-ai | 33 | 75893e62c2dee55ef909ff742494aa0f29ec8eaa4e20a4b996263d33ca807ecb |
| koki-advert-vision | 21 | 0bb7a7999ef6403497a6b84bd2fb6f5c219ace56bf439b5f7c152b69332be342 |
| koki-admin-control | 24 | b45c884552da2b7606cc16eb77406395bad4d62545fa7facb9aec2f011faef78 |
| koki-improvement-engine | 20 | a4b64ab9a9f162ace16c494d0a1d9e4ea10a7b802ac3bfcbb93e54471d1194f9 |
| koki-emergency-gemini | 14 | e62deaa1cd7ae6461f868452af9d7a7165f97bf272b0f9518d78323eff8d9bfe |
| koki-strategy-engine | 22 | 9949448ad4a4801107eec69092ccc478f50360432d370a6d6061376db50c0870 |
| koki-self-improvement-admin | 19 | 2225e2306226bb6bb92acab37fc01d74a7b2a2743490f90903e0de8e1c5f23c2 |
| koki-admin | 14 | 8dc2ff9aeabfe3dd896befbae96ba1c0cfd053aae2847afd8347f47dcf59bcd7 |
| koki-strategy-admin | 20 | 056e054096be5df91fcabe874fbfc01d61a0e0260aa224153bd0c8e733b60da0 |
| koki-strategy-engine-core-v8 | 16 | 98736d231d1e1d20af36d8cb2f3a9cc39529009173f954d838a6fdce88e65bd0 |
| koki-context-orchestrator | 18 | ec74a610752e84158fa558351f7d6abd53f41d84d250b150a985facad4377b21 |
| koki-strategy-consistency-guard | 16 | 2ea8a3a6b83c12b92d13b5b1925e9384776cff34b56efaf3ceba8935b20b9c4c |
| koki-push-admin | 23 | ac4446bada5c94229a473e80df7cbea27f8e46e6276953d88f4e977758096683 |
| koki-push-service | 24 | 7182549c114277011192fa982ee66b57b434e5fcff62606b1ae646e5f6dd4fe9 |
| koki-push-sw | 27 | c2ee441c5240f16e610485acf3d6a3f892903abdcd430b08aecebf866f12ed2e |
| koki-strategy-refresh-worker | 15 | 8b687241608c2ef2c84b1d9a026ebaff83afd2f6e14bfb8b0aa0e8a2ddd3e18f |
| koki-strategy-watchdog | 14 | 44633ec6879814f54a93e0fb09e0b56f9666fe2557352eaba3efaed8af2c03a4 |
| koki-gemini-turn-decision | 23 | ad53f6818113985913e4db0364eac3910b41b7b8b72da8fb0f4f579184fc2c8a |

## Excluded from the frozen working baseline
- Every Edge Function whose name contains `staging`, `e2e`, or `test-agent`.
- Experimental numbered `*-prod-vN` test-agent functions.
- No unrelated project/deployment is included.

## Freeze rule
This reference is a restore/comparison baseline. Do not modify this branch or reinterpret its pinned backend versions. Any new KOKI work must happen outside this baseline unless an explicit user instruction says to alter the frozen reference.
