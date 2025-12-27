# London Cinema Calendar: Paid Advertising & Revenue Strategy

## Executive Summary

This plan outlines a comprehensive go-to-market strategy to monetize a London cinema calendar app targeting repertory film enthusiasts. The strategy prioritizes **validation before scale**, using Meta Ads to acquire subscribers at a target CAC of **£3-4** for a **£2.99/month** subscription, achieving payback within 6-8 weeks.

---

## Part 1: Subscription Pricing Strategy

### Recommended Pricing Model

| Tier | Price | Billing | Effective Monthly | Target Segment |
|------|-------|---------|-------------------|----------------|
| **Monthly** | £2.99/month | Recurring | £2.99 | Casual film-goers, trial converts |
| **Annual** | £24.99/year | One-time | £2.08 | Committed cinephiles |
| **Founding Member** (Launch only) | £19.99/year | One-time | £1.67 | Early adopters, community builders |

### Pricing Rationale

**Why £2.99/month (not £1.99 or £4.99):**

1. **Psychological threshold**: £2.99 sits below the £3 mental barrier while signaling sufficient value
2. **Unit economics viability**: Allows for £3-4 CAC with 6-8 week payback
3. **Competitive positioning**: Undercuts streaming services (£5.99-£15.99) while positioning above "free with ads" alternatives
4. **Niche premium**: Film enthusiasts expect to pay for curated, specialized tools

**Annual discount strategy**: The 30% discount (£24.99 vs £35.88) is aggressive enough to drive annual conversions while the Founding Member tier creates urgency and rewards early adoption.

### Revenue Projections

| Month | Monthly Subs | Annual Subs | MRR | Notes |
|-------|-------------|-------------|-----|-------|
| 1 | 50 | 20 | £190 | Validation phase |
| 3 | 200 | 80 | £763 | Optimization phase |
| 6 | 500 | 250 | £2,014 | Scaling begins |
| 12 | 1,200 | 600 | £4,638 | Sustainable growth |

---

## Part 2: Meta Ads Campaign Architecture

### Campaign Structure Overview

```
ACCOUNT STRUCTURE
│
├── AWARENESS (5% of budget)
│   └── Brand Video Views Campaign
│       └── Ad Set: London Film Lovers (Broad)
│           ├── Ad: "The Problem" (Pain point)
│           └── Ad: "Cinema Magic" (Emotional)
│
├── CONSIDERATION (25% of budget)
│   └── Traffic Campaign
│       ├── Ad Set: Repertory Cinema Interest
│       ├── Ad Set: Film Critic/Publication Followers
│       └── Ad Set: Arthouse Film Interest
│           ├── Ad: Feature Walkthrough
│           ├── Ad: Social Proof
│           └── Ad: Cinema Showcase
│
└── CONVERSION (70% of budget)
    └── Conversions Campaign (Optimize for Trial Start)
        ├── Ad Set: Warm Retargeting (Site Visitors)
        ├── Ad Set: Engaged Video Viewers (75%+)
        ├── Ad Set: Lookalike 1% (Converters)
        └── Ad Set: Interest Stack (Top Performers)
            ├── Ad: Direct Offer
            ├── Ad: Urgency/Scarcity
            └── Ad: Testimonial
```

### Detailed Campaign Specifications

#### Campaign 1: Brand Awareness (Video Views)

**Objective**: Build brand recognition and create retargeting pools

| Setting | Value |
|---------|-------|
| Objective | Video Views |
| Optimization | ThruPlay (15+ seconds) |
| Budget | £10-15/day |
| Placement | Instagram Reels, Facebook Video Feeds, Stories |
| Bid Strategy | Lowest Cost |

**Ad Set: London Film Lovers**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Location | London (25 mile radius) |
| Age | 25-54 |
| Interests (OR) | Independent film, Arthouse cinema, Film criticism, Documentary films, World cinema, British Film Institute, Film festivals |
| Behaviors | Engaged shoppers |
| Exclusions | Current subscribers, Site visitors (past 7 days) |

#### Campaign 2: Consideration (Traffic)

**Objective**: Drive qualified traffic to landing page, build intent signals

| Setting | Value |
|---------|-------|
| Objective | Traffic |
| Optimization | Landing Page Views |
| Budget | £25-35/day |
| Placement | Instagram Feed, Stories, Reels; Facebook Feed, Right Column |
| Bid Strategy | Cost Cap (£0.80 per LPV) |

**Ad Set A: Repertory Cinema Interest**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Location | London (25 mile radius) |
| Age | 28-50 |
| Interests (AND logic) | (Film OR Cinema OR Movies) AND (Any of: Criterion Collection, BFI, Curzon, Sight and Sound, Letterboxd, Film criticism, Classic films, Foreign films) |

**Ad Set B: Film Publication Followers**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Location | London (25 mile radius) |
| Age | 25-54 |
| Interests | Little White Lies, Sight and Sound, Empire Magazine, The Guardian Film, Time Out London, Timeout, Film4 |

**Ad Set C: Arthouse Enthusiasts**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Location | London (25 mile radius) |
| Age | 30-55 |
| Interests | European cinema, Japanese cinema, Korean cinema, A24, MUBI, Cannes Film Festival, Venice Film Festival |

#### Campaign 3: Conversion (Subscriptions)

**Objective**: Drive trial starts and subscriptions

| Setting | Value |
|---------|-------|
| Objective | Conversions |
| Conversion Event | Start Trial (primary) or Purchase (secondary) |
| Budget | £50-70/day (scaling phase) |
| Placement | All Meta placements, optimize for performance |
| Bid Strategy | Cost Cap (£4.00 per conversion) |

**Ad Set A: Warm Retargeting**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Custom Audience | Website visitors (14 days), excluding subscribers |
| Frequency Cap | 3 per week |

**Ad Set B: Engaged Video Viewers**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Custom Audience | 75% video viewers (30 days) |
| Exclusions | Website visitors (already in retargeting) |

**Ad Set C: Lookalike - Converters**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Source | Subscribers + Trial Starters |
| Lookalike | 1% UK (expand to 2-3% when scaling) |
| Location | London overlay |

**Ad Set D: Interest Stack (Best Performers)**

| Targeting Parameter | Specification |
|---------------------|---------------|
| Interests | Top 2-3 performing interest groups from Consideration |
| Narrow Further | Engaged shoppers OR Frequent travelers (cultural indicator) |

---

## Part 3: Audience Targeting Deep Dive

### Primary Audience Segments

#### Segment 1: The Dedicated Cinephile (Highest Value)

**Demographics:**
- Age: 30-50
- Income: £40,000+
- Education: Degree-level
- Location: Inner London postcodes (N1, E2, SE1, W1, NW1, SW1)

**Psychographics:**
- Attends 2+ cinema screenings per month
- Maintains Letterboxd account
- Subscribes to at least one streaming service focused on classics/indie (MUBI, Criterion Channel, BFI Player)
- Reads film criticism regularly

**Meta Targeting Translation:**
```
Interests: Letterboxd, Criterion Collection, MUBI, Sight and Sound,
           Film criticism, Arthouse cinema
Behaviors: Engaged shoppers, Technology early adopters
```

#### Segment 2: The Cultural Londoner (High Volume)

**Demographics:**
- Age: 25-45
- Location: Greater London
- Income: £30,000+

**Psychographics:**
- Attends cultural events weekly (theatre, galleries, cinema)
- Uses Time Out London
- Member of at least one cultural institution
- Active on Instagram, shares cultural experiences

**Meta Targeting Translation:**
```
Interests: Time Out London, Theatre, Art galleries, Museums,
           London events, Cultural activities
Behaviors: Frequent international travelers
```

#### Segment 3: The Nostalgic Film Lover (Underserved)

**Demographics:**
- Age: 40-60
- Location: London and commuter belt

**Psychographics:**
- Loves classic Hollywood, British cinema heritage
- Remembers repertory cinemas of the past
- Less digitally native but uses Facebook
- Values curation and discovery

**Meta Targeting Translation:**
```
Interests: Classic films, British films, Golden Age Hollywood,
           BBC Four, Talking Pictures TV, Turner Classic Movies
Placement preference: Facebook Feed, Right Column
```

### Interest Layering Strategy

**Tier 1 - Broad Film Interest (Awareness only):**
- Films, Cinema, Movies, Movie theater

**Tier 2 - Enthusiast Signals (Consideration):**
- Independent film, Documentary film, Foreign films, Film festivals

**Tier 3 - High-Intent Signals (Conversion):**
- Letterboxd, Criterion Collection, MUBI, BFI, Curzon, Sight and Sound

**Tier 4 - Behavioral Qualifiers (Layered with Tiers 2-3):**
- Engaged shoppers
- Technology early adopters
- Frequent travelers

### Exclusion Strategy

**Always exclude:**
- Current subscribers (upload email list weekly)
- Employees of cinemas (if identifiable)
- People who visited and bounced within 10 seconds

**Consider excluding:**
- Under 21 (low conversion, high CPM)
- Outside London (unless testing expansion)

---

## Part 4: Creative Strategy

### Creative Pillars

| Pillar | Emotional Driver | Proof Point |
|--------|------------------|-------------|
| **End the Endless Scroll** | Frustration relief | "12 cinema websites, 1 calendar" |
| **Never Miss a Screening** | FOMO, urgency | "That Tarkovsky retrospective sold out while you were checking Curzon" |
| **Your Cinema, Your Way** | Personalization | Filter by cinema, genre, director |
| **Join the Cinematheque** | Belonging | "3,000 London film lovers already inside" |

### Ad Concepts

#### Concept 1: "The Tab Nightmare" (Problem-Agitation)

**Format**: Video (15-30 seconds), Reel, Story

**Script:**
```
[Screen recording style, fast-paced]

"Okay, what's on at cinema this weekend..."
[Opens BFI website]
"Ooh, they have that Wenders retrospective..."
[Opens new tab - Curzon]
"But Curzon might have the new Kore-eda..."
[Opens new tab - Barbican]
"Wait, Barbican has a late-night Cronenberg..."
[Opens tabs: Picturehouse, ICA, Prince Charles, Genesis]
"Maybe I'll just stay home."

[Cut to app interface]
"Or... see everything in one place."

FilmCal. Every London indie cinema. One calendar.
£2.99/month. Try free for 7 days.
```

**Visual Direction:**
- Screen recording aesthetic, relatable chaos
- Quick cuts, mounting frustration
- Clean transition to calm, organized app interface
- End on satisfying calendar view with multiple cinemas color-coded

#### Concept 2: "The One That Got Away" (FOMO/Urgency)

**Format**: Static Image or Carousel

**Primary Image:**
A beautiful still from a classic film (or stylized illustration to avoid copyright), with overlay text:

```
"The 70mm Interstellar screening
at BFI IMAX sold out.

You found out 3 days later
on Letterboxd."
```

**Carousel Slides:**
1. FOMO hook (above)
2. "FilmCal alerts you when rare screenings drop"
3. "Filter by format: 35mm, 70mm, IMAX"
4. App screenshot showing alert feature
5. CTA: "Never miss a screening. Try free."

**Visual Direction:**
- Moody, cinematic color grading
- Film grain overlay for authenticity
- Clean typography, generous white space
- Subtle urgency without being aggressive

#### Concept 3: "The Cinema Lover's Cheat Code" (Value Proposition)

**Format**: Static Image

**Headline Options:**
- "12 cinema websites. 1 calendar. 0 missed screenings."
- "BFI + Curzon + Barbican + Picturehouse + 8 more = FilmCal"
- "The app London cinephiles wish existed 10 years ago."

**Body Copy:**
```
Every independent London cinema in one beautiful calendar.
Filter by cinema, genre, format, or director.
Get alerts for rare 35mm and 70mm screenings.

Join 3,000+ film lovers. £2.99/month.
```

**Visual Direction:**
- App screenshot as hero image
- Cinema logos arranged aesthetically below
- Clean, premium aesthetic (not startup-y)
- Film-inspired color palette (deep blacks, warm highlights)

#### Concept 4: "Behind the Velvet Rope" (Exclusivity/Community)

**Format**: Video testimonial or UGC-style

**Script:**
```
[Person walking into cinema, POV shot]

"I used to spend Sunday mornings planning my week's cinema trips.
Now I spend Sunday mornings actually watching films."

[Shows phone with app]

"FilmCal is like having a friend who works at every indie cinema in London.
The 35mm alerts alone are worth it."

[Cut to them in cinema seat, credits rolling]

"Last month I caught a surprise Kubrick double bill at Prince Charles
that I never would have found."

FilmCal. For people who take cinema seriously.
```

**Visual Direction:**
- Authentic, not polished
- Shot on iPhone aesthetic
- Real London cinema interiors (get permission)
- Warm, inviting tones

#### Concept 5: "The London Film Calendar" (Straightforward/SEO)

**Format**: Static image, clean and direct

**Headline:**
"The London Independent Cinema Calendar"

**Body:**
```
One app. Every screening. All your favorite cinemas.

BFI Southbank · Curzon · Barbican · ICA
Picturehouse · Prince Charles · Genesis · Everyman
Electric · Rio · ArtHouse Crouch End · and more

Start your free trial →
```

**Visual Direction:**
- Minimal, editorial aesthetic
- App screenshot with recognizable film titles
- Cinema logos as social proof strip
- Could pass for an Apple App Store feature

### Format Distribution

| Format | % of Creative Budget | Best Use Case |
|--------|---------------------|---------------|
| Video (15-30s) | 40% | Awareness, Reels, Stories |
| Static Image | 35% | Feed, Conversion |
| Carousel | 15% | Feature education |
| UGC/Testimonial | 10% | Social proof, Retargeting |

### Creative Testing Framework

**Phase 1: Hook Testing (Week 1-2)**

Test 3 different opening hooks with the same body:
1. Problem-focused: "Tired of checking 12 websites?"
2. Benefit-focused: "Every London indie cinema, one calendar"
3. Identity-focused: "For Londoners who take cinema seriously"

**Phase 2: Format Testing (Week 3-4)**

Winner from Phase 1, test across:
1. Static image
2. Video (15s)
3. Carousel
4. Story-native format

**Phase 3: Audience-Creative Matching (Week 5-6)**

Pair winning creatives with audience segments:
- Cinephiles get insider/community messaging
- Cultural Londoners get convenience messaging
- Nostalgic segment gets heritage/curation messaging

---

## Part 5: Budget Allocation & Scaling Roadmap

### Phase 1: Validation (Weeks 1-4)

**Objective**: Prove CAC target is achievable, identify winning audiences and creatives

| Line Item | Daily | Weekly | Monthly |
|-----------|-------|--------|---------|
| Awareness | £10 | £70 | £280 |
| Consideration | £30 | £210 | £840 |
| Conversion | £40 | £280 | £1,120 |
| **Total** | **£80** | **£560** | **£2,240** |

**Success Criteria to Proceed:**
- CAC under £5 (preferably under £4)
- CTR above 1.2% on Consideration ads
- At least 50 trial starts
- Trial-to-paid conversion above 40%

**Decision Point (End of Week 4):**
- If CAC < £4 and trial conversion > 40%: Proceed to Phase 2
- If CAC £4-6: Optimize creatives and targeting, extend Phase 1
- If CAC > £6: Reassess product-market fit or pricing

### Phase 2: Optimization (Weeks 5-8)

**Objective**: Optimize for efficiency, prepare for scale

| Line Item | Daily | Weekly | Monthly |
|-----------|-------|--------|---------|
| Awareness | £15 | £105 | £420 |
| Consideration | £40 | £280 | £1,120 |
| Conversion | £70 | £490 | £1,960 |
| **Total** | **£125** | **£875** | **£3,500** |

**Activities:**
- Kill underperforming ad sets (bottom 30%)
- Double down on top performers
- Introduce lookalike audiences based on converters
- Begin retargeting at scale
- Test annual subscription offer

**Success Criteria to Proceed:**
- Stable CAC under £4
- At least 200 total subscribers
- Identified 2-3 scalable audience segments
- At least one creative with CAC < £3

### Phase 3: Scaling (Weeks 9-16)

**Objective**: Acquire subscribers at scale while maintaining efficiency

| Line Item | Daily | Weekly | Monthly |
|-----------|-------|--------|---------|
| Awareness | £25 | £175 | £700 |
| Consideration | £60 | £420 | £1,680 |
| Conversion | £120 | £840 | £3,360 |
| Creative Production | - | £200 | £800 |
| **Total** | **£205+** | **£1,635** | **£6,540** |

**Scaling Rules:**
1. Increase budget by 20% every 3 days if CAC is stable
2. Never increase by more than 30% in a single day
3. If CAC rises 25%+, pause and investigate before continuing
4. Maintain creative refresh every 2 weeks to combat fatigue

### Phase 4: Sustainable Growth (Week 17+)

**Objective**: Optimize for LTV, not just acquisition

| Line Item | Daily | Weekly | Monthly |
|-----------|-------|--------|---------|
| New Acquisition | £150 | £1,050 | £4,200 |
| Retention/Win-back | £30 | £210 | £840 |
| Brand Building | £20 | £140 | £560 |
| Creative Production | - | £300 | £1,200 |
| **Total** | **£200+** | **£1,700** | **£6,800** |

**LTV Optimization Activities:**
- Churn reduction campaigns (remind users of value)
- Annual upgrade campaigns
- Referral program amplification
- Seasonal campaigns (film festival season, awards season)

### Budget Summary by Phase

| Phase | Duration | Monthly Budget | Target Subs | Target CAC |
|-------|----------|----------------|-------------|------------|
| Validation | 4 weeks | £2,240 | 50-100 | < £5 |
| Optimization | 4 weeks | £3,500 | 150-250 | < £4 |
| Scaling | 8 weeks | £6,540 | 500+ | £3-4 |
| Sustainable | Ongoing | £6,800 | 200+/month | £3-3.50 |

---

## Part 6: Unit Economics Analysis

### Core Metrics

| Metric | Target | Calculation |
|--------|--------|-------------|
| Monthly subscription price | £2.99 | - |
| Annual subscription price | £24.99 | £2.08/month effective |
| Target CAC | £3.50 | Blended across channels |
| Payment processor fees | 3% + £0.20 | Stripe UK |
| Net revenue per monthly sub | £2.70 | £2.99 - (£0.09 + £0.20) |
| Net revenue per annual sub | £24.04 | £24.99 - (£0.75 + £0.20) |

### Subscriber Lifetime Value

**Assumptions:**
- Monthly churn: 8% (12.5 month average lifetime)
- Annual renewal: 70%
- Annual:Monthly subscriber ratio: 30:70

**Monthly Subscriber LTV:**
```
Average lifetime = 1/0.08 = 12.5 months
LTV = 12.5 × £2.70 = £33.75
```

**Annual Subscriber LTV:**
```
Year 1 = £24.04
Year 2 (70% renew) = 0.7 × £24.04 = £16.83
Year 3 (70% of Y2) = 0.7 × £16.83 = £11.78
Total LTV = £52.65
```

**Blended LTV (70% monthly, 30% annual):**
```
Blended LTV = (0.7 × £33.75) + (0.3 × £52.65) = £39.42
```

### LTV:CAC Ratio

| Scenario | CAC | LTV:CAC | Verdict |
|----------|-----|---------|---------|
| Target | £3.50 | 11.3:1 | Excellent |
| Acceptable | £5.00 | 7.9:1 | Good |
| Break-even (monthly) | £33.75 | 1:1 | Minimum viable |

**Industry benchmark**: SaaS/subscription typically targets 3:1 LTV:CAC. At 11:1, this business has significant headroom for scaling or margin.

### Payback Period

| Subscriber Type | CAC | Monthly Net Rev | Payback Period |
|-----------------|-----|-----------------|----------------|
| Monthly | £3.50 | £2.70 | 5.4 weeks |
| Annual | £3.50 | £24.04 (upfront) | Immediate |
| Blended | £3.50 | - | ~6 weeks |

### Monthly P&L Projection (at 1,000 subscribers)

| Line Item | Amount | Notes |
|-----------|--------|-------|
| **Revenue** | | |
| Monthly subs (700 × £2.99) | £2,093 | |
| Annual subs (300 × £2.08) | £624 | Monthly equivalent |
| **Gross Revenue** | **£2,717** | |
| | | |
| **Costs** | | |
| Payment processing | (£120) | ~4.4% blended |
| Hosting/Infrastructure | (£50) | Vercel, Neon, etc. |
| Paid acquisition | (£700) | ~200 new subs × £3.50 |
| **Total Costs** | **(£870)** | |
| | | |
| **Net Contribution** | **£1,847** | 68% margin |

### Sensitivity Analysis

| Variable | Change | Impact on CAC Target |
|----------|--------|---------------------|
| Price increase to £3.99 | +33% revenue | CAC can increase to £4.50 |
| Churn increases to 12% | -25% LTV | CAC must decrease to £2.75 |
| Annual ratio to 50% | +15% blended LTV | CAC can increase to £4.00 |
| Trial conversion drops to 30% | +33% effective CAC | Optimize funnel urgently |

---

## Part 7: Metrics & Optimization Framework

### Primary KPIs Dashboard

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| CAC (Blended) | < £3.50 | £4.00-5.00 | > £5.00 |
| Trial Start Rate | > 3% | 2-3% | < 2% |
| Trial-to-Paid | > 45% | 35-45% | < 35% |
| Monthly Churn | < 8% | 8-12% | > 12% |
| LTV:CAC | > 8:1 | 5-8:1 | < 5:1 |

### Funnel Metrics

| Stage | Metric | Target | Tracking |
|-------|--------|--------|----------|
| Impression | CPM | < £8 (London) | Meta Ads Manager |
| Click | CTR | > 1.2% | Meta Ads Manager |
| Click | CPC | < £0.80 | Meta Ads Manager |
| Landing Page | LPV Rate | > 85% | Meta + Analytics |
| Landing Page | Scroll Depth | > 60% to CTA | Analytics |
| Trial Start | Conversion Rate | > 4% of LPV | Analytics |
| Trial Start | Cost per Trial | < £2.50 | Calculated |
| Subscription | Trial-to-Paid | > 45% | Payment processor |
| Subscription | CAC | < £3.50 | Calculated |

### Weekly Optimization Checklist

**Every Monday:**
- [ ] Pull previous week's CAC by ad set
- [ ] Identify bottom 20% performers (by CAC)
- [ ] Check frequency on retargeting (should be < 4/week)
- [ ] Review creative fatigue (CTR decline > 20% = refresh)
- [ ] Check trial-to-paid conversion trend

**Optimization Decision Tree:**

```
CAC above target?
├── Yes → Is CTR below 1%?
│   ├── Yes → Creative problem. Test new hooks.
│   └── No → Is CPC above £1?
│       ├── Yes → Audience too competitive. Test new segments.
│       └── No → Is LPV rate below 80%?
│           ├── Yes → Technical issue. Check mobile experience.
│           └── No → Is trial start rate below 3%?
│               ├── Yes → Landing page problem. A/B test.
│               └── No → Trial-to-paid issue. Check onboarding.
│
└── No → Is there room to scale?
    ├── Yes → Increase budget 20%, monitor for 3 days.
    └── No → Test expansion audiences (Lookalikes, new geos).
```

### Attribution Setup

**Required Tracking:**

1. **Meta Pixel Events:**
   - PageView (all pages)
   - ViewContent (landing page)
   - InitiateCheckout (click "Start Trial")
   - StartTrial (custom event on trial activation)
   - Purchase (subscription confirmation)

2. **UTM Structure:**
   ```
   utm_source=meta
   utm_medium=paid
   utm_campaign={campaign_name}
   utm_content={ad_name}
   utm_term={adset_name}
   ```

3. **Conversion API:**
   - Server-side event matching for accurate attribution
   - Critical for iOS 14.5+ users

---

## Part 8: Implementation Timeline

### Week 0: Pre-Launch Setup

| Task | Owner | Deliverable |
|------|-------|-------------|
| Set up Meta Business Manager | Founder | Account ready |
| Install Meta Pixel + Conversion API | Founder/Dev | Events firing |
| Create custom conversions | Founder | Trial Start, Purchase events |
| Build landing page | Founder/Dev | Optimized for mobile |
| Design initial ad creatives (5) | Designer/AI | Ready for upload |
| Set up Stripe subscription | Founder/Dev | Payment flow working |
| Create audience lists | Founder | Saved in Ads Manager |

### Weeks 1-2: Validation Launch

| Day | Activity | Budget |
|-----|----------|--------|
| 1 | Launch Awareness campaign (2 ads) | £10/day |
| 1 | Launch Consideration campaign (3 ad sets, 2 ads each) | £30/day |
| 3 | Launch Conversion campaign (2 ad sets) | £40/day |
| 5 | First optimization pass - pause worst performer | - |
| 7 | Review Week 1 data, document learnings | - |
| 10 | Second optimization pass | - |
| 14 | Week 2 review, prepare Phase 2 decision | - |

### Weeks 3-4: Optimization Sprint

| Day | Activity | Budget Change |
|-----|----------|---------------|
| 15 | Kill bottom 30% of ad sets | -20% |
| 15 | Double budget on top performer | +20% |
| 17 | Launch 3 new creative variations | - |
| 21 | Introduce Lookalike audience | +£20/day |
| 24 | Test annual subscription offer | - |
| 28 | Phase 2 decision point | - |

### Weeks 5-8: Scale Preparation

| Week | Focus | Key Activities |
|------|-------|----------------|
| 5 | Audience expansion | Add 2% Lookalike, test adjacent interests |
| 6 | Creative refresh | Launch 5 new creatives based on learnings |
| 7 | Funnel optimization | A/B test landing page, improve trial-to-paid |
| 8 | Scale test | Increase budget 50%, monitor CAC stability |

### Weeks 9-16: Growth Phase

| Week | Focus | Budget Target |
|------|-------|---------------|
| 9-10 | Controlled scaling | £150/day |
| 11-12 | Creative diversification | £175/day |
| 13-14 | Audience expansion (outer London) | £200/day |
| 15-16 | Seasonal optimization (if applicable) | £200/day |

---

## Part 9: Risk Mitigation

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CAC too high | Medium | High | Start with tight targeting, expand carefully |
| Low trial-to-paid | Medium | High | Optimize onboarding, add trial reminders |
| High churn | Medium | Medium | Focus on engagement features, email nurture |
| Creative fatigue | High | Medium | Maintain 2-week refresh cycle |
| Audience saturation | Medium | Medium | Gradual geo expansion, new interest tests |
| iOS attribution issues | High | Medium | Implement Conversion API, use UTMs |
| Competitor entry | Low | High | Build brand loyalty, community features |

### Contingency Plans

**If CAC exceeds £6 after 4 weeks:**
1. Pause paid acquisition
2. Focus on organic/referral growth
3. Consider price increase to £3.99-4.99
4. Explore alternative channels (Reddit, film forums, partnerships)

**If trial-to-paid falls below 30%:**
1. Add email sequence during trial
2. Reduce trial length from 7 to 3 days
3. Require payment method upfront
4. Add value demonstration during trial (daily screening alerts)

**If monthly churn exceeds 15%:**
1. Implement win-back email campaign
2. Offer annual plan discount at month 2
3. Add engagement features (watchlist, screening history)
4. Survey churned users for feedback

---

## Part 10: Beyond Paid Ads - Complementary Channels

While Meta Ads should be the primary acquisition engine, these complementary channels can reduce CAC and build sustainable growth:

### Organic & Community (Low Cost, High Trust)

| Channel | Effort | Expected Impact | Timeline |
|---------|--------|-----------------|----------|
| Letterboxd engagement | 2 hrs/week | 10-20 subs/month | Ongoing |
| Reddit r/london, r/movies | 2 hrs/week | 5-15 subs/month | Ongoing |
| Film Twitter/X | 3 hrs/week | 10-20 subs/month | Ongoing |
| Local film club partnerships | 4 hrs/month | 20-50 subs/event | Quarterly |

### Referral Program

**Structure:**
- Give £1 credit, get £1 credit (for monthly subs)
- Give 1 month free, get 1 month free (for annuals)
- Cap at 3 referrals per user

**Expected CAC equivalent:** £1-2 per referred subscriber

### Cinema Partnerships

**Approach:**
- Offer co-branded content to cinema marketing teams
- "Powered by FilmCal" badge on their screening pages
- Revenue share or flat monthly fee for API access

**Potential partners:**
- Prince Charles Cinema (community-focused, likely receptive)
- Genesis Cinema (independent, locally focused)
- ICA (arts institution, interested in innovation)

---

## Appendix A: Complete Audience Targeting Reference

### Interest Categories for Meta Ads Manager

**Film & Cinema (Primary):**
- Independent film
- Arthouse cinema
- Documentary films
- Film criticism
- Film festivals
- World cinema
- European cinema
- Japanese cinema
- Korean cinema
- Classic films
- Cult films
- Film noir

**Publications & Media:**
- Sight and Sound (magazine)
- Little White Lies
- Empire Magazine
- The Guardian Film
- Film4
- BBC Four
- Talking Pictures TV

**Platforms & Services:**
- Letterboxd
- MUBI
- Criterion Collection
- BFI Player
- Curzon Home Cinema

**Venues & Events:**
- British Film Institute
- Barbican Centre
- ICA London
- London Film Festival
- Cannes Film Festival
- Venice Film Festival
- Sundance Film Festival

**Behavioral Qualifiers:**
- Engaged shoppers
- Technology early adopters
- Frequent international travelers
- Live event attendees

### Exclusion Lists

**Create and maintain:**
1. Current subscribers (email list, update weekly)
2. Cancelled subscribers (separate list for win-back only)
3. Employees (if identifiable)
4. Bot/fraud patterns (high bounce, instant exit)

---

## Appendix B: Landing Page Requirements

### Essential Elements

**Above the fold:**
- Clear headline: "Every London indie cinema. One calendar."
- Subhead: "BFI, Curzon, Barbican, Picturehouse + 8 more"
- App screenshot or video preview
- Primary CTA: "Start Free Trial"
- Social proof: "Join 3,000+ London film lovers"

**Below the fold:**
- How it works (3 steps)
- Cinema logos (trust signals)
- Key features with icons
- Testimonial/review
- Pricing transparency
- FAQ (especially about billing)
- Final CTA

### Technical Requirements

- Mobile-first design (70%+ traffic will be mobile)
- Load time < 3 seconds
- Meta Pixel properly installed
- UTM parameters captured
- Conversion events firing correctly

---

## Appendix C: Sample Ad Copy Library

### Short-Form (Headlines/Primary Text)

**Problem-focused:**
- "12 cinema websites. 0 sanity."
- "Stop googling 'what's on at BFI this week'"
- "Planning a cinema trip shouldn't take longer than the film"

**Benefit-focused:**
- "Every London indie cinema. One calendar."
- "BFI + Curzon + Barbican = FilmCal"
- "Never miss a 35mm screening again"

**Identity-focused:**
- "For Londoners who take cinema seriously"
- "Built by a cinephile, for cinephiles"
- "The app London film lovers wish existed"

**Urgency/FOMO:**
- "That Tarkovsky double bill sold out while you were checking Curzon"
- "70mm screenings sell out in hours. Get alerts in seconds."
- "Join before the next sold-out screening"

### Long-Form (Body Copy)

**Version A - Problem/Solution:**
```
You're a film lover in London. That should be a blessing, not a homework assignment.

But finding what's on means checking BFI, then Curzon, then Barbican, then Picturehouse, then ICA, then...

FilmCal puts every indie cinema screening in one calendar. Filter by cinema, format, or director. Get alerts for rare 35mm and 70mm showings.

Stop googling. Start watching.

£2.99/month. Cancel anytime.
```

**Version B - Emotional:**
```
Remember when going to the cinema was simple?

You'd check the listings, pick a film, buy a ticket.

Now it's 12 tabs, 3 different booking systems, and a spreadsheet to track what's where.

FilmCal brings back the joy. One calendar. Every independent London cinema. Curated for people who actually love film.

Join us. £2.99/month.
```

**Version C - Direct:**
```
FilmCal: The London independent cinema calendar.

• BFI, Curzon, Barbican, Picturehouse, ICA, Prince Charles, and more
• Filter by cinema, date, genre, or format
• Alerts for 35mm, 70mm, and IMAX screenings
• Works on any device

3,000+ London film lovers already use it.

Try free for 7 days. Then £2.99/month.
```

---

## Summary: Critical Success Factors

1. **Price at £2.99/month** - Sweet spot between value perception and unit economics viability

2. **Target CAC of £3.50** - Achievable with tight targeting; provides 11:1 LTV:CAC ratio

3. **Lead with problem, not product** - "End the endless scroll" resonates more than feature lists

4. **Start narrow, expand carefully** - Begin with high-intent audiences (Letterboxd, Criterion, BFI interests) before broadening

5. **Refresh creative every 2 weeks** - London audiences are sophisticated; fatigue hits fast

6. **Optimize for trial-to-paid** - This is where most subscription businesses fail; invest in onboarding

7. **Build community alongside acquisition** - Referrals and organic will reduce CAC over time

8. **Track obsessively, decide quickly** - Weekly optimization is essential; don't let underperformers drain budget

---

## Next Steps

1. Finalize subscription pricing and implement payment flow
2. Build landing page following requirements in Appendix B
3. Create initial 5 ad creatives based on concepts in Part 4
4. Set up Meta Business Manager and tracking
5. Launch Week 0 setup tasks
6. Begin Phase 1 validation on agreed start date
