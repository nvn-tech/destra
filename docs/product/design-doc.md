# Destra — Design Doc

Nov 4, 2026 · @Eduardo

## Overview

We are building Destra, a multi-tenant SaaS that learns what works on social media for a professional, writes posts in their own voice, and checks every post against their professional council's advertising rules before it is published. The first market is doctors in Brazil, starting with endocrinology.

**How it works for the user.** A doctor connects Instagram, adds the profiles they admire and a few interest tags. The system studies the posting style of those profiles and of the doctor's own account, finds similar high-performing content, and generates drafts. The doctor approves them, or lets Autopilot publish the ones that pass compliance. Engagement is measured after publishing and fed back, so the system learns what works for that doctor's audience.

**Why niche-first.** Regulated professionals need compliance that generic tools don't offer. Many doctors in one specialty follow the same top profiles, so a shared data corpus makes each new tenant cheaper to serve. Expansion means adding vertical packs: dentistry (CFO), nutrition (CFN), psychology (CFP) and law (OAB).

### Key decisions

| Decision       | Choice                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Market         | Brazil first, PT-BR from day one                                                                               |
| Niche          | Doctors (CFM rules), endocrinology first                                                                       |
| Business model | SaaS; each tenant has its own admin panel, all tenants on our platform                                         |
| Publishing     | User's choice: approval queue or Autopilot, with compliance as a safety floor                                  |
| First platform | Instagram + Facebook Pages (Facebook Login flow), then YouTube, X, Threads, LinkedIn (publish only) and TikTok |
| Data sourcing  | Official APIs only at launch, behind one adapter layer; scraping vendors only after a legal review             |

All CFM, ANVISA and LGPD references in this doc are design examples summarized from memory. A Brazilian health-law specialist must validate the rule set before launch.

## Architecture

The system is a loop, not a pipeline: ingest, understand style, discover more, generate, check compliance, publish, measure, adjust. The measure-and-adjust step is what makes it better than a generic post writer.

```text
Operational panel: onboarding, references, review queue, calendar, insights

Ingest ──► Analyze style ──► Discover ──► Generate
              ▲                              │ every draft
              │ adjust style target          ▼
           Measure ◄── Approve, publish ◄── Comply

Shared public corpus + tenant-private zone (RLS) on Postgres, pgvector, S3
```

Every draft passes compliance before it reaches the queue, and measured lift feeds back into the style target.

### Components

| Component                   | Responsibility                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Operational panel (Next.js) | Onboarding, references, tags, review queue, calendar, insights, settings           |
| Core API                    | Accounts, workspaces, users, OAuth token vault, billing                            |
| Ingest workers              | Pull posts and metrics through source adapters into the shared corpus              |
| Discovery workers           | Find similar high-performing content by topic, account graph and vector similarity |
| Analysis / style engine     | Extract features per post, build style profiles per account and per workspace      |
| Generation engine           | Plan, draft and polish variants in the doctor's voice                              |
| Compliance engine           | Check every variant against council rules, auto-fix, decide pass / review / block  |
| Publisher + metrics         | Schedule and publish, pull engagement back, close the feedback loop                |
| Storage                     | Postgres + pgvector, S3 for media, Temporal for workflows, Redis for rate limits   |

### Data access tiers

Data access is the main external constraint. All sources sit behind one Source Adapter interface, so they can be swapped.

| Tier | Source                                                                   | Cost                                         | Coverage                                                                              | Risk                                            |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0    | Official APIs (Meta Graph: Business Discovery, hashtag search, insights) | Free                                         | Instagram Business/Creator accounts; hashtags capped at about 30 per week per account | None                                            |
| 1    | Pay-per-result scrapers (Apify and similar)                              | Low, a few USD per 1,000 posts (approximate) | Broad                                                                                 | Medium: fragile, gray area under platform terms |
| 2    | Data aggregators (Phyllo, Bright Data, Modash-type)                      | High, enterprise contracts                   | Broad and stable                                                                      | Lower, vendor dependency                        |

The MVP uses tier 0 only, plus manual link paste. Tiers 1 and 2 are off at launch: every platform's terms ban scraping, US court wins for scrapers don't protect a Brazilian company, and scraping could get Destra's Meta app revoked, which would break publishing. Revisit after a legal review.

### Multi-tenancy

- Hierarchy: Account (billing) → Workspace (one professional or brand) → Users with roles (owner, editor, approver, viewer). Agencies and clinics later get many workspaces under one account, with no schema change.
- Two data zones: a **global public corpus** shared by all tenants, and a **tenant-private zone** isolated with Postgres row-level security on `workspace_id`.
- Which tenant references or likes which content is private, even though the content itself is shared.

### Autonomy levels

| Level              | Behavior                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Manual             | AI suggests, user writes and approves                                                        |
| Assisted (default) | AI drafts, user approves each post                                                           |
| Autopilot          | AI publishes on schedule only when compliance passes; flagged posts go to the approval queue |

Every level has an immutable audit log, a one-click kill switch, and explicit terms that the professional is responsible for what is published. CFM Res. 2.454/2026 keeps the doctor responsible for AI-generated advertising, so Autopilot is a narrow opt-in: it only publishes ideas from a queue the doctor approved in advance, and only when compliance passes.

## Data model

The model has a shared global corpus of public content, a private zone per tenant, and a thin link between them (`workspace_references`). One scrape of a popular profile serves every tenant who follows it. Stack: Postgres + pgvector, media in S3.

### Platform config (vertical packs)

| Table               | Purpose                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `verticals`         | slug (`medicina-br`), country, language, regulator                                             |
| `vertical_versions` | Immutable config: prompts, tone presets, templates, required fields                            |
| `topics`            | Per-vertical taxonomy tree with embeddings, for mapping user tags                              |
| `compliance_rules`  | Code, version, severity, kind (regex, LLM judge, required field), definition, source reference |

### Global corpus (shared)

| Table                    | Purpose                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `source_accounts`        | Platform, handle, account type, verticals, crawl tier (hot / warm / cold), reference count, status          |
| `account_snapshots`      | Follower and media counts over time                                                                         |
| `posts`                  | Format, caption, hashtags, mentions, published\_at, content hash, ingestion source, owned-by-tenant flag    |
| `post_media`             | Media in S3 with `expires_at` for retention                                                                 |
| `post_metric_snapshots`  | Likes, comments, views, shares, saves at a given post age; partitioned by month                             |
| `post_features`          | Versioned structural, voice and visual features, transcript, OCR, comment summary (no commenter identities) |
| `post_embeddings`        | Caption, transcript, visual and combined vectors (HNSW index)                                               |
| `post_topics`            | Post → topic with confidence                                                                                |
| `post_performance`       | Engagement rate, z-score vs. the account's 90-day baseline, percentiles                                     |
| `account_style_profiles` | Versioned style profile per account                                                                         |
| `account_relations`      | Mentions, collabs, tags: the graph used for discovery                                                       |

Engagement is normalized against each account's own baseline. "2.3σ above this account's normal" is the signal worth learning from; raw likes mostly reflect audience size.

### Tenant zone (row-level security on `workspace_id`)

| Area                | Tables                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| Identity            | `accounts`, `workspaces`, `users`, `memberships`                                        |
| Professional        | `professional_profiles` (council, number, UF, specialties with RQE), `brand_settings`   |
| Connections         | `connected_accounts` (token reference into the vault, scopes, expiry)                   |
| Link to corpus      | `workspace_references` (weight, reason), `interest_tags` → topics                       |
| Private metrics     | `owned_post_insights` (reach, impressions, saves, follows)                              |
| Style and discovery | `workspace_style_targets`, `discovery_feed_items` (shown, saved, dismissed, used)       |
| Content             | `content_items` → `content_variants` → `compliance_checks`, `approvals`, `publications` |
| Accountability      | `generation_runs`, `usage_ledger`, append-only `audit_log` with hash chain              |

Content status runs idea → drafting → in\_review → approved → scheduled → published → measured (or rejected / failed). A published post links back to the corpus through `publications.post_id`, which closes the loop.

### Style profile schema

The same JSON shape is used for each reference account and for the blended workspace target:

```json
{
  "formats": { "carousel": 0.55, "reel": 0.35, "image": 0.1 },
  "cadence": { "posts_per_week": 4.2, "best_slots": ["ter 19h", "qui 12h"] },
  "hooks": {
    "distribution": { "myth_vs_fact": 0.3, "question": 0.25, "stat": 0.2, "story": 0.25 },
    "top_performing": ["myth_vs_fact", "stat"]
  },
  "voice": {
    "tone": "acolhedor-didático",
    "formality": 0.4,
    "person": "1st_singular",
    "jargon_level": 0.3,
    "emoji_density": 0.02
  },
  "structure": {
    "caption_len_p50": 620,
    "slides_p50": 7,
    "cta": { "save_post": 0.4, "comment": 0.3, "dm": 0.1, "none": 0.2 }
  },
  "topics": [{ "topic_id": 412, "share": 0.35, "lift": 1.8 }],
  "visual": { "text_overlay": 0.8, "face_on_cover": 0.6 },
  "exemplars": [9912, 10233, 10871],
  "meta": { "sample_size": 120, "window_days": 90, "extractor_version": "v3" }
}
```

`lift` is how much a trait over-performs the account's baseline. Generation and the feedback loop optimize for lift, not for frequency.

### Design decisions

1. Own posts live in the corpus; private insights stay in the tenant zone.
2. Everything derived is versioned (extractors, profiles, prompts, rules), so reprocessing never loses history and every compliance verdict is provable.
3. Metrics are immutable snapshots, compared at the same post age.
4. LGPD and copyright by design: media expiry, raw payload retention limits, comments stored only as aggregates, no patient data. For third-party posts, store derived features rather than the media (Brazil has no text-and-data-mining exception), and delete or refresh other YouTube channels' data within 30 days.
5. Room to grow: `vertical_ids[]`, `vertical_version_id` and the account → workspace hierarchy cover new niches and agencies.
6. Scale: partition metrics and audit log by month; move vectors to a dedicated vector DB past a few million posts.

## Compliance engine

The compliance engine is a layered funnel: cheap deterministic checks first, LLM judges for subtle cases, and every verdict comes with evidence, a rule reference and a suggested fix. Rules are also injected into generation, so most drafts never trigger a violation.

**When it runs:** on generated drafts, on user edits, on the inspiration corpus (so the style engine never learns from non-compliant viral posts), and on all scheduled posts when the rule set changes.

### Pipeline

1. **Normalize.** Split each variant into segments with locations: caption, each slide, reel script, on-screen text, hashtags, OCR from images, signature.
2. **Deterministic checks.** Required fields (CRM + UF; RQE when a specialty is claimed), PT-BR lexicons (`garantid*`, "100% eficaz", "cura definitiva", superlatives), patterns (prices, promotions, percentages near outcomes, prescription drug names, dosages), hashtag blacklist.
3. **Claim extraction.** One LLM call breaks content into atomic claims with a type (efficacy, statistic, dosage, educational).
4. **LLM judges.** Rubric per rule, structured output (verdict, confidence, spans, rationale, fix). Use a different model or prompt than the generator, temperature 0, majority of 3 runs for block rules, rules grouped into 4–5 calls.
5. **Evidence grounding.** Efficacy and statistic claims are checked against PubMed, SciELO and specialty society guidelines: supported (attach citation), unsupported (soften or remove), contradicted (block).
6. **Visual checks.** Detect before/after images and identifiable patients; require consent records.
7. **Decide.** Any hard block → BLOCK; block with high confidence → BLOCK; any warn or low confidence → REVIEW; all pass with high confidence → PASS (Autopilot may publish).
8. **Auto-fix.** Send violations back to the generator to rewrite only the flagged spans, at most 2–3 rounds, re-running the full check each time.

### Example rule

```json
{
  "code": "CFM-HORMONIO-FINALIDADE-ESTETICA",
  "source_reference": "CFM Res. 2.333/2023",
  "severity": "hard_block",
  "kind": "llm_judge",
  "applies_to": { "vertical": "medicina-br", "topics": ["hormonios/*"] },
  "definition": {
    "rubric": "Bloquear se o conteúdo promove ou sugere uso de hormônios/esteroides anabolizantes para fins estéticos, ganho de massa muscular ou performance.",
    "positive_examples": ["Quer ficar trincado? Fale comigo sobre o chip"],
    "negative_examples": [
      "Reposição de testosterona é indicada em hipogonadismo confirmado por exames"
    ]
  },
  "prevention_hint": "Nunca associar hormônios a estética, músculos ou performance."
}
```

### Starting rule categories for medicina-br

| Category                | Examples                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identification          | Name, CRM/UF and specialty + RQE in the bio of every network; specialty claimed only with RQE; postgraduate mentions without RQE need "não especialista" |
| Promises                | Guaranteed results, "cura", "sem riscos"                                                                                                                 |
| Sensationalism          | Fear-mongering, "segredo que escondem", miracle framing                                                                                                  |
| Self-promotion          | Superlatives ("o melhor"), comparisons with colleagues                                                                                                   |
| Unrecognized practices  | Anti-aging protocols without evidence, aesthetic hormone use                                                                                             |
| Individual medical acts | Diagnosing or prescribing to a specific person in a post                                                                                                 |
| Medication              | Prescription drug promotion to the public (RDC 96/2008), compounded hormone implants, dosages                                                            |
| Patients                | Before/after conditions, consent, identifiable patients                                                                                                  |
| Commercial              | Prices, discounts, giveaways tied to procedures                                                                                                          |

### Overrides and accountability

| Severity    | Override                                                                      |
| ----------- | ----------------------------------------------------------------------------- |
| warn        | User overrides with written justification; logged and used to tune the rule   |
| block       | Only with an explicit "I take responsibility" attestation; never by Autopilot |
| hard\_block | No override; the content must change                                          |

Every check, verdict, override and approval goes into the hash-chained audit log.

### Evaluation

- **Golden dataset:** a few hundred real posts labeled per rule by a health-law consultant, including tricky negatives (posts that mention steroids in order to warn against them).
- **Metrics per rule:** recall for block rules (target ≥ 95%), precision for warn rules.
- **CI regression:** any rule, prompt or model change reruns the golden set; a drop in block recall fails the merge.
- **Production feedback:** overrides, rejections and "this flag is wrong" clicks become labeling candidates.

Additional tables: `rule_applicability`, `compliance_runs`, `extracted_claims`, `compliance_overrides`, `consent_records`, `compliance_eval_cases`.

The rule set and golden dataset are proprietary, improve with every override, and extend to other councils by swapping vertical packs. That makes compliance the main moat.

## Pipeline flows

Eight event-driven flows move content from ingestion to publishing and back. Temporal runs the long, retry-heavy workflows (onboarding, publishing, fix loops); a Postgres outbox + event bus handles fan-out.

| #   | Flow                     | Trigger                                                                                  | What it does                                                                                                                                                             | Output                                   |
| --- | ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1   | Onboarding               | Sign-up + Instagram connect                                                              | Profile with CRM/RQE, backfill own posts, map tags to topics, seed references (instant if already in corpus), text-only enrichment, v0 style target, 5-idea starter pack | First drafts in under 15 minutes         |
| 2   | Ingestion                | Crawl scheduler by tier (hot 6–12h, warm daily, cold weekly), new reference, pasted link | Adapter fallback chain, rate limiting, normalize, upsert, dedupe, media to S3, first metrics                                                                             | `posts.ingested`                         |
| 3   | Enrichment               | `posts.ingested`, reprocess jobs                                                         | Cheap: text features, embeddings, topics, compliance pre-scan. Gated (own posts, top 30%, hot accounts): transcripts, vision, comment summary                            | `posts.enriched`                         |
| 4   | Metrics & performance    | Post age                                                                                 | Own posts at 1h/6h/24h/72h/7d/30d; references at 7d (hot also 24h/72h); recompute z-scores and percentiles; trigger gated enrichment                                     | `performance.updated`                    |
| 5   | Style profiles           | Weekly, N new posts, workspace change                                                    | Aggregate distributions, compute lift, pick exemplars; blend own + references + learned adjustments                                                                      | `style_target.updated`                   |
| 6   | Discovery                | Daily per workspace, on feed open                                                        | Candidates from topics, account graph, vector similarity, hashtag quota; filter; rank; diversify                                                                         | Feed of \~30 items, suggested references |
| 7   | Plan → generate → comply | Weekly plan, "use as inspiration", Autopilot queue                                       | Plan ideas with bandit strategy mix, generate 3 variants, originality check, compliance + fix loop, route                                                                | Approval queue or schedule               |
| 8   | Publish & learn          | Approval, scheduled time, 24h/7d after publish                                           | Render, re-check rules, token health, idempotent publish, link to corpus; attribute performance to strategy tags, update bandit and style target                         | Weekly insights                          |

### Supporting flows

| Flow                | Trigger                      | What it does                                                                  |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Rule update re-scan | New rule set version         | Re-check scheduled and approved posts; demote failures to review              |
| Token health        | Daily                        | Refresh tokens, detect revoked access, warn the user before publishing breaks |
| LGPD retention      | Daily                        | Delete expired media and raw payloads; handle deletion requests               |
| Reference cleanup   | Weekly                       | Recompute reference counts and crawl tiers                                    |
| Usage & budget      | Continuous                   | Roll up `usage_ledger`; per-plan caps; margin alerts                          |
| Golden-set CI       | Rule, prompt or model change | Re-run compliance evals                                                       |

### Queue lanes

| Lane        | Examples                                       | Target latency                        |
| ----------- | ---------------------------------------------- | ------------------------------------- |
| interactive | Onboarding, "generate now", compliance on edit | Seconds                               |
| scheduled   | Publishing, metric checkpoints                 | On time (±1 min)                      |
| batch       | Enrichment, reprocessing, profile recompute    | Hours; cheapest models and batch APIs |

### Reliability and cost controls

- Every job is idempotent, keyed on entity + version; retries are safe.
- Outbox pattern: DB row and event written in one transaction.
- Dead-letter queues and an admin replay screen.
- Token-bucket rate limiters per platform, adapter and OAuth token (Redis).
- Shared corpus: each public post is crawled and enriched once for all tenants.
- Expensive enrichment only for top performers and own posts; reference metrics mostly at 7d.
- Batch APIs and prompt caching; full compliance only on the selected variant; per-tenant budget caps.
- One trace ID per content item, end to end. Dashboards: time to first draft, approval rate, block rate, cost per published post, engagement lift.

### Example: one post end to end

On Monday the crawler pulls a reference's carousel "5 mitos sobre a tireoide". By Wednesday it is in that account's top 10%, which triggers full enrichment. On Thursday it appears in Dra. Ana's feed and she taps "usar como inspiração". Three variants are generated in her voice; compliance changes "cura o cansaço" to "pode ajudar a entender o cansaço", adds her CRM/RQE signature and attaches two SBEM references. She approves it on her phone for Tuesday 19h. A week later it reaches 2.1× her baseline, and the bandit raises the weight of myth-vs-fact carousels in her next plan.

## Generation engine

The generation engine plans before it writes: a brief, three deliberately different angles, parallel drafts, a polish pass, then originality and compliance gates. Its goals are the doctor's voice, proven patterns, compliance by construction, originality, and variants that teach the system something.

| Step                    | Model tier         | Purpose                                                                              |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| Brief                   | None (code)        | Topic, format, slot, strategy tags, inspirations, constraints                        |
| Angles                  | Mid                | Three distinct angles with slide-by-slide outlines                                   |
| Draft × 3               | Strong             | Each angle written in parallel                                                       |
| Polish                  | Mid                | PT-BR naturalness, length limits, preview line, hashtags; signature injected by code |
| Originality, compliance | See below          | Gates                                                                                |
| Rank                    | Code + small model | Order variants and explain why                                                       |

### Prompt layers (ordered for caching)

| Layer            | Contents                                                                                | Cache scope             |
| ---------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| L1 System        | Role, PT-BR rules, platform mechanics, output JSON schema                               | Global                  |
| L2 Vertical pack | Compliance prevention hints, tone presets, format templates, "never do" list            | Per vertical            |
| L3 Workspace     | Identity (name, CRM, RQE), style card, brand settings, learned edit rules, opinion bank | Per workspace, \~weekly |
| L4 Request       | Brief, angle, few-shot exemplars, inspiration skeletons                                 | Not cached              |

**The style card** turns profile numbers into plain-language instructions. Voice and "what works" are prose; hard limits are numbers checked in code:

```text
VOZ DA DRA. ANA
- Tom acolhedor e didático; fala "você", nunca "vocês".
- Frases curtas. Usa analogias do dia a dia.
- Quase sem emojis (no máximo 1, no fim).

O QUE FUNCIONA PARA ELA
- Ganchos "mito vs. fato" e "estatística" (2,1× e 1,7× a média).
- Carrosséis de 6–8 slides; CTA "salve para consultar depois".

LIMITES DUROS
- Legenda 400–800 caracteres; primeira linha ≤ 110.
- Máx. 25 palavras por slide. 3–5 hashtags.
```

Output is structured JSON per format (strategy tags, slides, caption, preview line, hashtags, self-declared claims, signature).

### Few-shot selection

| Pool                   | Purpose                                   | Passed as                   |
| ---------------------- | ----------------------------------------- | --------------------------- |
| Own posts              | Voice anchor                              | Full text, 2–3 posts        |
| Reference exemplars    | Pattern anchor                            | Skeleton only, 1–2 posts    |
| Vertical gold examples | Compliance-safe tone for sensitive topics | Full text, only when needed |

- **Skeletons** describe a top post's structure (hook type, slide-by-slide intent, CTA) without its wording. This is the main originality lever.
- **Retrieval score:** topic similarity × performance percentile × format match × compliance-clean × recency, diversified with MMR. Own posts are chosen for voice match, not only performance.
- **Cold start:** a 2-minute voice recording ("explain a topic like you would to a patient") becomes the voice anchor; a short tone questionnaire maps to a preset; gold examples carry more weight until 10+ posts are approved.

### Variant strategy

| Variant        | Strategy                      | Example                    |
| -------------- | ----------------------------- | -------------------------- |
| V1 Exploit     | Best strategy for this doctor | Myth-vs-fact carousel      |
| V2 Exploit-alt | Second best                   | Statistic-hook carousel    |
| V3 Explore     | Under-tested                  | Personal-story reel script |

Variants keep the topic and change one axis (hook, format or angle), so each choice is informative. Ranking = style fit × bandit prior × compliance, shown with a reason ("ganchos com estatística tiveram 1,7× sua média").

**Learning:** chosen vs. unchosen variants are stored as preference pairs. Weekly, an LLM summarizes repeated edits (draft vs. published) into learned edit rules added to the style card, such as "sempre troca 'pacientes' por 'você'".

### Originality

| Threat                | Check                                                                            | Action                              |
| --------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Copying inspiration   | 5-gram overlap, longest common substring, embedding similarity                   | Rewrite avoiding flagged phrases    |
| Self-repetition       | Similarity vs. the workspace's last 90 days                                      | Warn, or suggest a new angle        |
| Cross-tenant sameness | Similarity vs. other tenants' recent generations in the vertical (internal only) | Force a different angle or skeleton |

Prevention beats detection: skeletons instead of text, an **opinion bank** (the doctor's views, frequent patient questions, anonymized anecdotes) with at least one item used per post, and a required personal element in every angle.

### Format templates

| Format      | Rules                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| Carousel    | Slide 1 = hook only; 5–8 slides; ≤ 25 words per slide; last slide = summary + CTA |
| Caption     | First \~110 characters must hook on their own                                     |
| Reel script | Hook in 3 seconds; timed beats; on-screen text; shot list; 30–60 s                |
| Hashtags    | 3–5 from a vertical-approved list                                                 |
| Signature   | Injected by code from the professional profile                                    |

### Evaluation

- Offline set of about 50 briefs per design-partner workspace, rerun on every prompt or model change.
- LLM rubric judge (voice match, hook strength, clarity, PT-BR naturalness, format), scored 1–5.
- Voice classifier test: can an embedding classifier tell this draft is the doctor's?
- One-tap weekly ratings from design partners.
- Online: approval rate, edit distance, time to approve, engagement vs. baseline.

## Cost-benefit and Brazil specifics

Per-tenant running cost is plausibly a low double-digit USD amount per month, against a price around R$197–497 per month. These are estimates to validate in the pilot with real `usage_ledger` data.

### The niche multiplier

Within one specialty, many doctors follow the same 50–200 top profiles. With a shared corpus, a popular profile is crawled and enriched once and served to every tenant who references it. Per-tenant data cost falls as the niche fills, which horizontal tools don't get.

### Cost drivers per tenant per month (approximate)

| Driver                   | Volume                                       | Control                                                 |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------- |
| Public post ingestion    | \~1,000 posts, much less after cache sharing | Crawl tiers by reference count; per-plan reference caps |
| Text analysis            | Same posts, cheap model, batched             | Batch APIs                                              |
| Reference metric refetch | Hidden main cost                             | Mostly one 7-day snapshot                               |
| Transcription and vision | Gated to top performers and own posts        | Self-host Whisper when volume justifies it              |
| Generation               | \~60 posts × 3 variants                      | Prompt caching of static layers                         |
| Compliance               | Full check on the selected variant only      | Deterministic checks first; claim cache                 |

### Data sourcing recommendation

- **MVP:** official APIs only, shared cache, manual link paste. Scraping vendors would cost roughly $5–150/month but move all the legal risk to Destra.
- **Later:** consider a vendor only after a legal review, preferring consent-based providers where the creator connects their own account.

### Brazil specifics

| Area         | Notes                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms    | Instagram first for doctors, then TikTok, YouTube Shorts, LinkedIn; WhatsApp status/channels later                                                              |
| Language     | PT-BR from day one; tone axis from formal to warm and informal                                                                                                  |
| Regulation   | CFM advertising rules (Res. 2.336/2023), hormone prescription limits (Res. 2.333/2023), ANVISA rules on drug advertising; validate with a health-law specialist |
| LGPD         | Legitimate interest basis, data minimization, retention limits, no commenter identities, no patient data, appointed DPO                                         |
| Billing      | Recurring card + Pix + boleto via Asaas, Pagar.me, Iugu or Stripe BR; NFS-e issuance                                                                            |
| Go-to-market | Medical conferences, specialty societies (e.g., SBEM), medical marketing agencies                                                                               |

## Legal and platform constraints

The doctor stays legally responsible for every AI-generated post, so per-post approval plus the audit log is the main protection for both the doctor and Destra. From the November 2026 research; many items came from secondary sources and need checking against official texts before they become rules.

### Rules that shape the product

| Rule                                 | What it means for Destra                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFM Res. 2.454/2026 (AI in medicine) | AI doesn't exempt the doctor from the ethics code; AI advertising must follow advertising rules strictly. Default to approval; Autopilot only from a pre-approved queue.                                                                                                                                      |
| CFM Res. 2.336/2023 (advertising)    | Name, CRM/UF, specialty + RQE in every network's bio; "não especialista" for postgraduate mentions without RQE; reposted patient content counts as the doctor's own post; before/after only with conditions (sources conflict).                                                                               |
| CFM Res. 2.333/2023 + ANVISA         | No hormones or steroids for aesthetics or performance; no advertising of compounded hormone implants; no promoting prescription-only drugs to the public (RDC 96/2008). Hard blocks, not warnings.                                                                                                            |
| CONAR influencer guide (May 2026)    | Classify content (advertising vs. organic) and disclose brand relationships.                                                                                                                                                                                                                                  |
| CFN Res. 856/2026 (nutrition)        | Bans before/after even with consent; each council needs its own rule pack.                                                                                                                                                                                                                                    |
| LGPD + ANPD                          | Public profiles are personal data. Destra is controller of the shared corpus: needs a legitimate-interest assessment (LIA), impact report (RIPD) and DPO. ANPD standard contract clauses are mandatory, word for word, for US AI and cloud vendors since Aug 2025. Incidents reported within 3 business days. |
| PL 2338/2023 (AI bill)               | Still pending in the Chamber. Destra is not high-risk unless it adds diagnosis or triage features.                                                                                                                                                                                                            |
| Platform terms                       | All platforms ban scraping; scraping risks revocation of the API apps Destra needs for publishing.                                                                                                                                                                                                            |

### Platform feasibility

| Platform                   | Read own posts                | Own analytics                           | Read others' posts                                                       | Publish                                             | Scheduling             | Review needed                                   |
| -------------------------- | ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| Instagram (Facebook Login) | Yes                           | Yes (views, reach, saves, shares)       | Business/Creator accounts via Business Discovery; hashtags 30 per 7 days | Images, carousels 2–10, Reels, Stories; 100 per 24h | Destra's scheduler     | Business Verification + App Review, 1–2+ months |
| Facebook Pages             | Yes                           | Yes                                     | No                                                                       | Yes                                                 | Native, 10 min–30 days | Part of Meta review                             |
| Threads                    | Yes                           | Yes                                     | No                                                                       | 250 per 24h                                         | Destra's scheduler     | Separate review                                 |
| X                          | Yes (\~$0.001 per read)       | Own posts, \~30 days of private metrics | Yes, \~$0.005 per post read                                              | \~$0.015 per post ($0.20 with a link)               | Destra's scheduler     | Pay-per-use; no training models on X content    |
| LinkedIn                   | No (`r_member_social` closed) | Needs Community Management approval     | No                                                                       | Text, images, video, PDF carousels                  | Destra's scheduler     | Self-serve for posting; approval for analytics  |
| TikTok                     | Yes                           | Basic counts                            | No commercial API                                                        | Private-only for up to 5 users until audit          | Destra's scheduler     | Audit 2–6+ weeks                                |
| YouTube                    | Yes                           | Analytics API (48–72h delay)            | Public videos; 30-day storage limit                                      | \~100 uploads/day per project                       | Native (`publishAt`)   | Quota audit                                     |

### Pre-launch legal checklist

- [ ] Company registered (CNPJ) and Meta Business Verification started
- [ ] INPI trademark filing for "Destra" (classes 9, 35, 42; \~R$440 per class with small-business discount) and destra.com.br registered
- [ ] DPO appointed; records of processing kept
- [ ] Legitimate-interest assessment for the shared corpus and an impact report (RIPD)
- [ ] ANPD standard contract clauses signed with LLM and cloud vendors
- [ ] Incident response plan (3 business days to notify)
- [ ] Privacy policy, data deletion callback and deauthorization callback for Meta
- [ ] Terms of use: doctor responsible, Autopilot as explicit revocable opt-in, AI disclosure, 7-day refund on first subscription, liability cap
- [ ] Health-law specialist signs off on rule pack v0 (CFM 2.336, 2.333, 2.454; ANVISA RDC 96; CONAR 2026 guide)
- [ ] Optional "conteúdo revisado por Dr(a)." disclosure and AI metadata on media

## Implementation plan

With 3 engineers, the MVP (Assisted mode on Instagram) takes about 14 weeks, followed by a paid beta by week 22. The schedule risks are Meta App Review and the legal rule set; both start in week 0.

### Phases

| Phase         | Weeks | Goal                                                                                                                                                                                                                                     | Exit criteria                                                                                                |
| ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0 Foundations | 0–4   | CNPJ, Meta Business Verification + App Review (allow 1–2+ months), DPO, LIA and RIPD, INPI filing, legal rule set v0, 10–15 design partners, seed references, golden set, technical skeleton                                             | Review submitted, rule set signed off, partners committed                                                    |
| 1 MVP         | 4–14  | Assisted mode on Instagram: onboarding, ingestion, text enrichment, style, generation, compliance, approval, publishing, basic insights                                                                                                  | First draft < 15 min; ≥ 50% approved with light edits; block recall ≥ 95%; 70% of partners publishing weekly |
| 2 Paid beta   | 14–22 | YouTube, X, Threads, LinkedIn (publish only), TikTok (inbox drafts while its audit runs); billing (card, Pix, boleto, NFS-e), carousel rendering, discovery feed, feedback loop, evidence grounding, gated reel analysis; 50–100 doctors | Partner conversion, measurable engagement lift, cost per tenant within margin                                |
| 3 Scale       | 22–34 | Autopilot (pre-approved queue only), reel scripts, TikTok Direct Post after audit, ranker v2, clinic team roles                                                                                                                          | Stable compliance metrics under Autopilot                                                                    |
| 4 Expansion   | 34+   | Vertical packs (CFO, CFN, CFP, OAB), agency mode, WhatsApp, LinkedIn                                                                                                                                                                     | New vertical live mostly through config                                                                      |

Out of MVP scope on purpose: Autopilot, discovery feed, video analysis, visual rendering, other platforms, billing.

### MVP sprint plan (2-week sprints)

The AI engineer starts a concierge phase in week 1: generating real posts for design partners with scripts, before any pipeline exists. If drafts aren't good, nothing else matters.

| Sprint        | Backend (BE)                                                                                                                                      | Panel (FS)                                                       | AI                                                                             | Non-engineering                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| S0 (wk 0–2)   | Repo, CI, Postgres + pgvector, auth, tenancy + RLS, Temporal, S3, vault; create Meta app                                                          | Design system, app shell, login, workspace setup                 | Concierge: collect 3 partners' data, prototype style card + generation         | Recruit partners; legal kickoff; golden-set labeling |
| S1 (wk 2–4)   | Facebook Login flow (IG account linked to a Facebook Page), own-post backfill, Business Discovery, hashtag search, corpus tables, crawl scheduler | Onboarding: connect IG, CRM/RQE, references, tags                | Text features, embeddings, topic taxonomy v0                                   | Weekly concierge drafts → feedback                   |
| S2 (wk 4–6)   | Event bus + outbox, enrichment workers, own-post metric snapshots                                                                                 | References screen, topic confirmation                            | Style profiles + blend + style card; few-shot retrieval + skeletons            | Rule set v0; record App Review demo and submit       |
| S3 (wk 6–8)   | Generation workflow, `generation_runs`, `usage_ledger`                                                                                            | Review queue: variants side by side, inline edit, approve/reject | Angles → draft → polish; 3-variant strategy; originality                       | Golden set \~200 posts                               |
| S4 (wk 8–10)  | Compliance tables, hash-chained audit log                                                                                                         | Compliance UI: highlighted spans, reasons, fixes, overrides      | Compliance v1: deterministic + claims + judges + fix loop + signature; eval CI | Lawyer reviews judge outputs                         |
| S5 (wk 10–12) | Publishing, scheduler, token health, idempotency                                                                                                  | Calendar, scheduling, publish status, notifications              | Edit capture + weekly edit rules; offline eval set                             | Alpha: partners use the real product                 |
| S6 (wk 12–14) | 24h/7d metrics, cost dashboards, observability, hardening                                                                                         | Insights v1, onboarding polish                                   | Tune thresholds and prompts; voice-sample cold start                           | Measure exit criteria; plan beta                     |

Before App Review approval, a Meta app in development mode works for users with a role on the app, so design partners can be added as testers.

### Team

| Role                  | Allocation | Focus                                                   |
| --------------------- | ---------- | ------------------------------------------------------- |
| Tech lead / backend   | 1          | Data model, workflows, integrations                     |
| Full-stack            | 1          | Next.js panel                                           |
| AI/LLM engineer       | 1          | Enrichment, style, generation, compliance judges, evals |
| Product designer      | 0.5        | Onboarding and review queue UX                          |
| Health-law consultant | Part-time  | Rule set, golden-set labels, terms                      |
| Founder / GTM         | 1          | Design partners, societies, agencies                    |

| Team size   | MVP duration                                                                 |
| ----------- | ---------------------------------------------------------------------------- |
| 2 engineers | \~20–22 weeks                                                                |
| 3 engineers | \~14 weeks                                                                   |
| 5 engineers | \~10–12 weeks (App Review, legal review and partner learning don't compress) |

MVP running costs (infra, LLM, scraping) for 10–15 partners should stay in the low hundreds of USD per month; people are almost the whole budget.

### Build vs. buy

| Buy                                                                                                                    | Build (the moat)                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Auth (Clerk, Auth0 or Supabase), payments (Asaas), Temporal Cloud, S3, LLM APIs (under ANPD contract clauses), Whisper | Style engine, compliance engine + golden set, vertical packs, feedback loop, shared corpus |

### Risks

| Risk                                                  | Mitigation                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Meta App Review delayed or rejected                   | Start in week 0; clean demo; testers in development mode; manual link fallback             |
| Official APIs too limited for discovery               | Curated seed lists, manual link paste, hashtag quota; revisit vendors after a legal review |
| Compliance miss gets a doctor in trouble with the CRM | Human approval by default, block-recall gate in CI, audit trail, clear terms               |
| Drafts sound generic                                  | Weight own voice, learn from edits, partner feedback loops                                 |
| No engagement lift → churn                            | Measure lift from day 1, show insights, tune the bandit                                    |
| LLM costs exceed price                                | `usage_ledger` from day 1, gating, batch APIs, caching, plan limits                        |

### Metrics from day 1

| Area       | Metrics                                                     |
| ---------- | ----------------------------------------------------------- |
| Activation | Time to first draft, % publishing within 7 days             |
| Quality    | Approval rate, edit distance draft vs. published            |
| Outcome    | Engagement vs. the doctor's own baseline                    |
| Safety     | Block rate, overrides, golden-set recall and precision      |
| Business   | Cost per published post, cost per tenant, conversion, churn |
