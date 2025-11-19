# Playlist Manager - Product Roadmap

## Vision

Build the **definitive free alternative to TuneMyMusic** that goes far beyond simple playlist migration to become the **go-to source of information about music** users are listening to in real-time.

### Core Value Propositions

1. **Free Playlist Management**: Export, import, and migrate playlists across all major streaming services at no cost
2. **Rich Music Information**: Comprehensive artist biographies, discographies, and contextual information that far exceeds what streaming services provide
3. **Real-Time Companion**: Detect what you're playing and provide lyrics, artist info, and recommendations instantly
4. **Discovery Engine**: Explore related artists, scenes, and movements with explained relationships
5. **Ethical Monetization**: Support artists through vinyl, concert tickets, and merchandise recommendations instead of paywalls

## Strategic Positioning

### vs TuneMyMusic
- **Them**: Paid ($4.50/month), limited to playlist migration only
- **Us**: Free (ad/affiliate supported), migration + comprehensive music info

### vs Streaming Services (Spotify, Apple Music, etc.)
- **Them**: Walled gardens with basic artist info
- **Us**: Universal companion that works with ALL services and provides 10x more information

### vs Last.fm / RateYourMusic
- **Them**: Scrobbling/cataloging focus, outdated UI
- **Us**: Real-time companion with modern UX, active playlist management

## Product Phases

### Phase 0: Foundation (CURRENT - Complete by Q1 2026)

**Goal**: Solid technical foundation with core playlist management

**Status**: ~60% complete
- ✅ Backend infrastructure (Fastify, Prisma, PostgreSQL, Redis)
- ✅ OAuth integration (Spotify complete, others partial)
- ✅ Database schema for playlists, tracks, artists
- ✅ Mobile app framework (Expo/React Native)
- ⚠️ Export/import functionality (partially complete)
- ❌ Web UI (stub only)

**Critical Tasks**:
1. **[09-export-import-completion]** - Complete CSV/JSON export and playlist recreation
2. **[10-web-ui-completion]** - Build functional web application
3. **Fix provider integrations** - Complete Deezer, Tidal, YouTube Music

**Success Metrics**:
- Can export/import playlists reliably
- Web app is functional and responsive
- API documentation is complete
- Tests achieve >80% coverage

---

### Phase 1: MVP - "Better TuneMyMusic" (Q1-Q2 2026)

**Goal**: Launch as the best free playlist migration tool

**Timeline**: 3-4 months

**Key Features**:
1. ✅ Spotify integration (complete)
2. Complete export/import for CSV, JSON, XSPF, M3U formats
3. **[05-additional-provider-integrations]** - Add Apple Music, Amazon Music
4. Web UI with core flows (export, import, dashboard)
5. Bulk operations (export all playlists)
6. Track matching by ISRC and fuzzy matching
7. Conflict resolution and dry-run mode

**Success Metrics**:
- 1,000 users migrate playlists successfully
- >95% track matching accuracy
- NPS score >50
- <5% error rate on exports

**Go-to-Market**:
- Launch on Product Hunt
- Reddit posts in r/spotify, r/playlists
- SEO for "free tunemymusic alternative"
- Social media campaign emphasizing FREE

---

### Phase 2: Rich Content - "Music Encyclopedia" (Q2-Q3 2026)

**Goal**: Become the go-to source for music information

**Timeline**: 3-4 months

**Key Features**:
1. **[02-rich-artist-information]** - Comprehensive artist biographies
   - Wikipedia, MusicBrainz, Last.fm integration
   - Hyperlinked navigation (artist → label → scene → related artist)
   - Full discography with album details
   - Editorial content and context

2. **[01-lyrics-integration]** - Lyrics display system
   - Genius and Musixmatch integration
   - Synchronized lyrics with auto-scroll
   - Multiple language support

3. **[08-related-artists-discovery]** - Advanced recommendation engine
   - Multiple relationship types (influences, collaborations, similar sound)
   - Explained relationships ("Similar because...")
   - Interactive graph visualization
   - Personalized recommendations

4. **[07-social-media-integration]** - Artist activity feeds
   - Instagram, Facebook, Mastodon integration
   - Recent posts and tour announcements
   - Social media aggregation

**Success Metrics**:
- Average session time >10 minutes (up from <3 minutes)
- 60% of users browse artist information
- >20% return rate within 7 days
- Artist pages have >85% data completeness

**Differentiation**:
- "We show you 10x more info than Spotify"
- "Understand the music, not just listen to it"
- "Your music professor in your pocket"

---

### Phase 3: Real-Time Companion (Q3-Q4 2026)

**Goal**: Become the app users keep open while listening to music

**Timeline**: 2-3 months

**Key Features**:
1. **[03-now-playing-detection]** - Real-time playback detection
   - Polling streaming service APIs
   - Android/iOS notification reading
   - WebSocket real-time updates
   - Transport controls (play/pause/skip)
   - Listening history tracking

2. **[04-active-playlist-editing]** - One-click playlist curation
   - Designate "active" playlist for quick editing
   - [+] button on every track throughout app
   - Real-time sync to streaming service
   - Offline queue with sync when online

3. Integration with desktop media players
   - Foobar2000, Deadbeef, VLC, Clementine plugins
   - Native desktop app (Electron or Tauri)

**Success Metrics**:
- >40% of users enable now playing detection
- Average session time >20 minutes
- Daily active usage (not just weekly)
- >5 tracks added per session via active playlist

**Marketing Angle**:
- "The app that's open while you listen to music"
- "See what you're hearing, instantly"
- "Playlist building made effortless"

---

### Phase 4: Monetization (Q4 2026)

**Goal**: Generate sustainable revenue to remain free

**Timeline**: 1-2 months

**Key Features**:
1. **[06-affiliate-monetization]** - Vinyl, tickets, merch
   - Discogs integration for vinyl
   - Bandsintown + ticketing platforms
   - Merchbar for artist merchandise
   - Contextual recommendations (buy vinyl of album you're viewing)
   - Affiliate link tracking and conversion attribution

2. Ad integration (non-intrusive)
   - Display ads in sidebar/footer
   - Native ads in artist feeds
   - Sponsored artist spotlights
   - Audio ads (future, controversial)

3. Premium tier (optional)
   - Offline lyrics
   - Advanced recommendations
   - Export scheduling
   - Priority support
   - Remove ads
   - Pricing: $4.99/month or $49/year (match TuneMyMusic)

**Success Metrics**:
- $1,000 MRR from affiliate sales
- $500 MRR from premium subscriptions (10% conversion at 1K users)
- 5% click-through rate on affiliate links
- 2% conversion rate on affiliate clicks
- Ad revenue covers server costs

**Revenue Projections** (conservative):

| MAU | Affiliate | Premium | Ads | Total MRR |
|-----|-----------|---------|-----|-----------|
| 10K | $500 | $500 | $200 | $1,200 |
| 50K | $2,500 | $2,500 | $1,500 | $6,500 |
| 100K | $5,000 | $5,000 | $4,000 | $14,000 |
| 500K | $25,000 | $25,000 | $30,000 | $80,000 |

---

### Phase 5: Advanced Features (2027)

**Goal**: Expand feature set and market reach

**Timeline**: Ongoing

**Key Features**:
1. **More streaming providers**
   - SoundCloud (independent artists)
   - Bandcamp (indie music)
   - Qobuz (audiophiles)
   - Pandora (US market)

2. **Social features**
   - Follow other users
   - Share playlists and discoveries
   - Collaborative playlists
   - Music taste matching ("You and X have 85% similar taste")
   - Activity feed

3. **Advanced discovery**
   - AI-powered recommendations
   - Mood-based playlists
   - Decade/era exploration
   - Genre deep-dives
   - Music theory analysis

4. **Artist tools**
   - Artist dashboard (claim your page)
   - Edit/contribute to biography
   - Upload exclusive content
   - Analytics (who's listening to you)
   - Direct fan communication

5. **Data products**
   - API for developers (paid)
   - Music intelligence reports
   - Trend analysis
   - Licensing music data to labels/DSPs

---

## Technical Architecture Priorities

### Must Have
- ✅ Scalable backend (Fastify + Prisma + PostgreSQL)
- ✅ OAuth for all major providers
- ⚠️ Robust worker system for background jobs
- ❌ WebSocket for real-time updates
- ❌ CDN for media assets
- ❌ Caching strategy (Redis, CDN)

### Should Have
- Kubernetes deployment for scaling
- Monitoring and alerting (Prometheus, Grafana)
- Error tracking (Sentry)
- Analytics (Plausible)
- A/B testing framework
- Feature flags system

### Nice to Have
- GraphQL API (in addition to REST)
- Server-side rendering (Next.js)
- Progressive Web App
- Desktop app (Electron/Tauri)
- Browser extension

---

## Risk Assessment

### Technical Risks
1. **API Rate Limits**: Streaming services may restrict our access
   - *Mitigation*: Caching, user-owned tokens, partnerships

2. **Provider API Changes**: APIs break without warning
   - *Mitigation*: Automated testing, monitoring, quick response team

3. **Scale**: Database/infrastructure can't handle growth
   - *Mitigation*: Design for scale from start, load testing

4. **Content Quality**: Artist bios, lyrics may be inaccurate
   - *Mitigation*: Multiple sources, user reporting, moderation

### Business Risks
1. **Competition**: TuneMyMusic drops prices or adds features
   - *Mitigation*: We're free + way more features, hard to compete

2. **Legal**: Copyright issues with lyrics, bios, or affiliated content
   - *Mitigation*: Proper attribution, licenses, DMCA compliance

3. **Monetization**: Affiliate revenue lower than expected
   - *Mitigation*: Multiple revenue streams, premium tier backup

4. **User Acquisition**: Hard to get users away from established apps
   - *Mitigation*: SEO, viral features, free value proposition

### Operational Risks
1. **Costs**: Infrastructure costs exceed revenue
   - *Mitigation*: Optimize early, monetize fast, premium tier

2. **Support**: Can't handle user support volume
   - *Mitigation*: Self-service docs, community forum, chatbot

---

## Success Metrics by Phase

### Phase 1 (MVP)
- 1K users
- 10K playlists migrated
- 95% success rate
- 3-star average rating

### Phase 2 (Rich Content)
- 10K users
- 20 min average session
- 60% browse artist info
- 4-star average rating

### Phase 3 (Real-Time)
- 50K users
- Daily active users
- 40% use now playing
- Viral sharing begins

### Phase 4 (Monetization)
- 100K users
- $10K MRR
- Profitable
- 10% premium conversion

---

## Resource Requirements

### Team (Current)
- 1 Full-stack developer (you)
- Need: Designer (contract)
- Need: Content writer (for bios)

### Team (Growth)
- 2 Backend developers
- 2 Frontend developers
- 1 Designer
- 1 Product manager
- 1 DevOps engineer
- 1 Support specialist

### Budget (Year 1)
- Infrastructure: $500/month → $2K/month
- APIs: $200/month → $1K/month
- Design: $5K one-time
- Marketing: $1K/month
- Legal: $2K one-time
- **Total**: ~$50K

---

## Next Steps (Immediate)

1. **Complete Phase 0 foundation** (4 weeks)
   - Finish export/import functionality
   - Build web UI core pages
   - Complete provider integrations

2. **Launch MVP** (8 weeks)
   - Polish UX for export/import flows
   - Write documentation
   - Set up analytics
   - Soft launch (friends & family)
   - Product Hunt launch

3. **Start Phase 2** (after MVP launch)
   - Begin artist information system
   - Integrate Wikipedia & MusicBrainz APIs
   - Design artist page UI

---

## Conclusion

This roadmap takes Playlist Manager from a simple export tool to a comprehensive music companion platform. By offering core features for free and monetizing through ethical means (affiliates, optional premium), we can capture the market that TuneMyMusic currently serves while providing 10x more value.

The key is executing Phase 0 and Phase 1 flawlessly to establish trust and user base, then building on that foundation with rich features that make us indispensable.

**Goal for 2026**: 100K users, profitable, the go-to free playlist manager and music information source.

---

*Last Updated: 2025-11-19*
*Version: 1.0*
*Owner: Rick Pfahl*
