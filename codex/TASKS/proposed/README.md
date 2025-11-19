# Proposed Tasks - Overview

This directory contains detailed task specifications for features that need to be implemented to achieve the product vision outlined in [00-ROADMAP.md](./00-ROADMAP.md).

## Task Summary

| ID | Task | Priority | Effort | Phase | Status |
|----|------|----------|--------|-------|--------|
| 09 | [Export/Import Core Completion](./09-export-import-completion.yaml) | **Critical** | 4-5 weeks | Phase 0 | Proposed |
| 10 | [Web UI Completion](./10-web-ui-completion.yaml) | **High** | 8-10 weeks | Phase 0 | Proposed |
| 05 | [Additional Provider Integrations](./05-additional-provider-integrations.yaml) | **Medium** | 8-12 weeks | Phase 1 | Proposed |
| 02 | [Rich Artist Information](./02-rich-artist-information.yaml) | **High** | 6-8 weeks | Phase 2 | Proposed |
| 01 | [Lyrics Integration](./01-lyrics-integration.yaml) | **High** | 3-4 weeks | Phase 2 | Proposed |
| 08 | [Related Artists Discovery](./08-related-artists-discovery.yaml) | **High** | 6-8 weeks | Phase 2 | Proposed |
| 07 | [Social Media Integration](./07-social-media-integration.yaml) | **Medium** | 5-6 weeks | Phase 2 | Proposed |
| 03 | [Now Playing Detection](./03-now-playing-detection.yaml) | **Critical** | 5-6 weeks | Phase 3 | Proposed |
| 04 | [Active Playlist Editing](./04-active-playlist-editing.yaml) | **High** | 4-5 weeks | Phase 3 | Proposed |
| 06 | [Affiliate Monetization](./06-affiliate-monetization.yaml) | **High** | 4-5 weeks | Phase 4 | Proposed |

---

## Priority Definitions

- **Critical**: Blocks core functionality or other features. Must be done first.
- **High**: Important for competitive advantage and user value. Do soon after critical tasks.
- **Medium**: Nice to have, enhances experience but not blocking.
- **Low**: Future enhancement, can be deferred.

---

## Phase 0: Foundation (Current - Q1 2026)

**Goal**: Complete the core playlist management infrastructure

### Critical Path
1. **[Task 09] Export/Import Core Completion** (4-5 weeks)
   - CSV/JSON/XSPF export formats
   - Import and playlist recreation
   - Track matching (ISRC + fuzzy)
   - Bulk operations with progress
   - *Blocks*: Everything - this is the MVP core value

2. **[Task 10] Web UI Completion** (8-10 weeks)
   - React SPA with all core pages
   - Dashboard, playlists, export/import flows
   - Responsive design
   - *Blocks*: User accessibility, growth

**Timeline**: 12-14 weeks if done sequentially, 10-11 weeks with parallel work

**Dependencies**: These two can be worked in parallel (backend engineer + frontend engineer)

---

## Phase 1: MVP Launch (Q1-Q2 2026)

**Goal**: Launch as the best free TuneMyMusic alternative

### Key Tasks
1. **[Task 05] Additional Provider Integrations** (8-12 weeks)
   - Priority: Apple Music, Amazon Music, SoundCloud
   - Full OAuth and API integration
   - 1-2 weeks per provider
   - *Unlocks*: Larger addressable market

**Timeline**: Can start in parallel with Phase 0, targeting 2-3 providers for MVP

---

## Phase 2: Rich Content (Q2-Q3 2026)

**Goal**: Become the definitive music information source

### Parallel Track A: Information Systems (6-8 weeks)
1. **[Task 02] Rich Artist Information** (6-8 weeks)
   - Wikipedia, MusicBrainz, Last.fm integration
   - Comprehensive biographies with hyperlinks
   - Discography and relationships
   - *Unlocks*: Engagement, session time

### Parallel Track B: Discovery & Content (3-6 weeks each)
2. **[Task 01] Lyrics Integration** (3-4 weeks)
   - Genius, Musixmatch integration
   - Synchronized lyrics display
   - *Unlocks*: User retention, differentiation

3. **[Task 08] Related Artists Discovery** (6-8 weeks)
   - Multi-source relationship aggregation
   - Recommendation algorithm
   - Graph visualization
   - *Unlocks*: Music discovery, virality

4. **[Task 07] Social Media Integration** (5-6 weeks)
   - Instagram, Facebook, Mastodon feeds
   - Real-time artist activity
   - *Unlocks*: Fresh content, stickiness

**Timeline**: 8-10 weeks total with 2-3 engineers working in parallel

**Suggested Approach**:
- Start with Artist Information (foundational)
- Add Lyrics (quick win, high impact)
- Add Related Artists (complex, high value)
- Add Social Media (nice to have, can be v2)

---

## Phase 3: Real-Time Companion (Q3-Q4 2026)

**Goal**: Make the app essential during listening sessions

### Sequential Tasks
1. **[Task 03] Now Playing Detection** (5-6 weeks)
   - Streaming API polling
   - Android/iOS notification detection
   - Real-time WebSocket updates
   - *Critical for*: Real-time companion vision

2. **[Task 04] Active Playlist Editing** (4-5 weeks)
   - One-click add to active playlist
   - Real-time sync to streaming services
   - Offline queue
   - *Requires*: Now playing detection to be fully effective

**Timeline**: 9-11 weeks sequential (Now Playing must complete first)

---

## Phase 4: Monetization (Q4 2026)

**Goal**: Achieve profitability

### Key Task
1. **[Task 06] Affiliate Monetization** (4-5 weeks)
   - Discogs (vinyl), Bandsintown (tickets), Merchbar (merch)
   - Contextual recommendations
   - Conversion tracking
   - *Unlocks*: Revenue, sustainability

**Timeline**: 4-5 weeks, can start once Artist pages are live (Phase 2)

**Additional**: Ad integration and premium tier can be done by 1 engineer in 2-3 weeks

---

## Development Sequence Recommendations

### Parallel Track Strategy (Optimal - 3 developers)

**Months 1-3** (Phase 0):
- **Dev 1**: Export/Import backend + API
- **Dev 2**: Web UI foundation + core pages
- **Dev 3**: Provider integrations (Apple Music, Amazon)

**Months 4-6** (Phase 1/2 overlap):
- **Dev 1**: Artist Information system
- **Dev 2**: Web UI polish + artist pages
- **Dev 3**: Lyrics integration

**Months 7-9** (Phase 2/3):
- **Dev 1**: Now Playing Detection
- **Dev 2**: Related Artists + visualization
- **Dev 3**: Social Media integration

**Months 10-12** (Phase 3/4):
- **Dev 1**: Active Playlist Editing
- **Dev 2**: Affiliate Monetization
- **Dev 3**: Premium features + polish

### Solo Developer Strategy (Realistic - 1 developer)

**Focus on MVP first, then iterate:**

1. **Months 1-3**: Complete Phase 0 (Export/Import + Basic Web UI)
2. **Month 4**: Launch MVP, gather feedback
3. **Months 5-7**: Add 2-3 core features based on user feedback
4. **Month 8**: Monetization (critical for sustainability)
5. **Months 9-12**: Continue adding features, marketing, growth

**Minimum Viable Feature Set (6 months)**:
- ✅ Export/Import (Task 09)
- ✅ Web UI basics (Task 10 - simplified)
- ✅ 1-2 additional providers (Task 05 - partial)
- ✅ Basic artist info (Task 02 - Phase 1 only)
- ✅ Affiliate monetization (Task 06)

Then iterate based on traction and user feedback.

---

## Resource Requirements

### Development
- **Minimum**: 1 full-stack developer (you) = 12-18 months for all features
- **Optimal**: 3 developers (backend, frontend, integration) = 6-9 months
- **Recommended**: 2 developers to start, scale to 3-4 after MVP

### Other Roles
- **Designer**: Contract for 1-2 months during Phase 0 (Web UI design)
- **Content Writer**: Contract for Phase 2 (Artist bios if not using APIs entirely)
- **QA/Test**: Hire after MVP (Month 4)
- **DevOps**: Contract or part-time (Month 6+)

### Budget Estimate

| Item | Month 1-3 | Month 4-6 | Month 7-12 | Total |
|------|-----------|-----------|------------|-------|
| Infrastructure | $500 | $1,000 | $2,000/mo | $15,000 |
| APIs (Genius, etc.) | $200 | $500 | $1,000/mo | $8,000 |
| Design (contract) | $5,000 | - | - | $5,000 |
| Content (contract) | - | $2,000 | $3,000 | $5,000 |
| Marketing | - | $1,000 | $1,000/mo | $7,000 |
| Legal | $2,000 | - | - | $2,000 |
| **Monthly** | **$7,700** | **$4,500** | **$7,000** | - |
| **Total** | - | - | - | **~$50,000** |

*Note: Does not include developer salaries (assumes founder/bootstrapped)*

---

## Success Metrics

Track these KPIs throughout development:

### Phase 0 (Foundation)
- ✅ Export/import success rate >95%
- ✅ Web UI functional on 3 browsers
- ✅ Test coverage >80%
- ✅ API response time <500ms

### Phase 1 (MVP)
- 📊 1,000 users
- 📊 10,000 playlists migrated
- 📊 NPS >50
- 📊 3+ star app rating

### Phase 2 (Rich Content)
- 📊 10,000 users
- 📊 20 min average session time
- 📊 60% browse artist pages
- 📊 20% weekly active rate

### Phase 3 (Real-Time)
- 📊 50,000 users
- 📊 40% enable now playing
- 📊 30 min average session
- 📊 Daily active users

### Phase 4 (Monetization)
- 💰 $10,000 MRR
- 💰 5% affiliate CTR
- 💰 2% conversion rate
- 💰 10% premium tier adoption

---

## Risk Mitigation

### Technical Risks
- **API Rate Limits**: Build caching layer early, user-owned tokens
- **Provider Changes**: Automated testing, monitoring, quick patch cycle
- **Scale Issues**: Design for scale from start, load testing in Phase 1

### Business Risks
- **Competition**: Move fast, add unique features (artist info), stay free
- **Low Revenue**: Multiple revenue streams, pivot if needed
- **Legal Issues**: Proper attribution, licenses, lawyer review

---

## Questions & Decisions Needed

Before starting, clarify:

1. **Team Size**: Solo or hiring? (Changes timeline dramatically)
2. **Budget**: Bootstrapped or funded? (Affects scope and timeline)
3. **MVP Scope**: Minimal (6 months) or feature-rich (12 months)?
4. **Target Launch**: When do you want to launch MVP?
5. **Primary Platform**: Web or mobile first? (Current setup is mobile)
6. **Monetization Priority**: How important is profitability in Year 1?

---

## Next Steps

1. **Review this roadmap** and prioritize tasks based on your goals
2. **Decide on MVP scope** - what's the minimum to launch?
3. **Create GitHub issues** from these YAML files
4. **Set up project board** with phases as columns
5. **Start with Phase 0** - complete export/import and web UI
6. **Launch MVP** - get users, gather feedback
7. **Iterate** - build features that users actually want

---

## Contributing

To add a new task:

1. Create a YAML file following the template
2. Add entry to this README
3. Update roadmap if it changes the strategy
4. Submit PR for review

---

*For questions or discussions about these tasks, contact: [Your Email]*

*Last Updated: 2025-11-19*
