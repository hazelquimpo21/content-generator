# Brand Discovery System - Implementation Guide

## Overview

This document contains all reference content, AI prompts, UI specifications, and implementation details for the Brand Discovery System. Use alongside BRAND-DISCOVERY-ARCHITECTURE.md.

---

## Reference Content: Values Cards

### The 30 Values for Card Swipe

```javascript
const VALUES_DECK = [
  // Core Values
  { id: "authenticity", label: "Authenticity", description: "Being genuine and true to yourself" },
  { id: "integrity", label: "Integrity", description: "Doing the right thing, even when it's hard" },
  { id: "honesty", label: "Honesty", description: "Speaking truth with compassion" },
  { id: "freedom", label: "Freedom", description: "Autonomy and self-determination" },
  { id: "justice", label: "Justice", description: "Fairness and equity for all" },
  { id: "balance", label: "Balance", description: "Harmony between different life areas" },
  { id: "simplicity", label: "Simplicity", description: "Clarity and minimizing complexity" },
  { id: "peace", label: "Peace", description: "Inner calm and conflict resolution" },
  { id: "autonomy", label: "Autonomy", description: "Self-governance and independence" },
  { id: "groundedness", label: "Groundedness", description: "Being rooted and stable" },

  // Growth Values
  { id: "growth", label: "Growth", description: "Continuous learning and development" },
  { id: "courage", label: "Courage", description: "Facing fears and taking risks" },
  { id: "resilience", label: "Resilience", description: "Bouncing back from adversity" },
  { id: "curiosity", label: "Curiosity", description: "Wonder and desire to understand" },
  { id: "wisdom", label: "Wisdom", description: "Deep understanding and good judgment" },
  { id: "creativity", label: "Creativity", description: "Innovation and self-expression" },
  { id: "excellence", label: "Excellence", description: "Striving for high quality" },
  { id: "mastery", label: "Mastery", description: "Deep expertise and skill" },
  { id: "adventure", label: "Adventure", description: "Exploration and new experiences" },
  { id: "transformation", label: "Transformation", description: "Profound change and evolution" },

  // Relational Values
  { id: "connection", label: "Connection", description: "Deep bonds with others" },
  { id: "compassion", label: "Compassion", description: "Care for others' suffering" },
  { id: "empathy", label: "Empathy", description: "Understanding others' experiences" },
  { id: "community", label: "Community", description: "Belonging to something larger" },
  { id: "belonging", label: "Belonging", description: "Being accepted and included" },
  { id: "trust", label: "Trust", description: "Reliability and faith in others" },
  { id: "presence", label: "Presence", description: "Being fully here, now" },
  { id: "service", label: "Service", description: "Contributing to others' wellbeing" },
  { id: "generosity", label: "Generosity", description: "Giving freely of yourself" },
  { id: "vulnerability", label: "Vulnerability", description: "Openness and emotional honesty" }
];
```

### Value Nuance Options (AI "Why" Step)

These are generated dynamically by AI, but here are examples for common values:

```javascript
const VALUE_NUANCE_EXAMPLES = {
  "authenticity": [
    {
      id: "radical_transparency",
      label: "Radical Transparency",
      description: "Sharing your own struggles, behind-the-scenes, 'here's what I got wrong'",
      content_style: "Personal stories, admitting mistakes, showing the messy middle"
    },
    {
      id: "permission_to_be_messy",
      label: "Permission to Be Messy",
      description: "Normalizing imperfection, anti-hustle, 'you don't have to have it figured out'",
      content_style: "Validating struggle, challenging perfectionism, 'good enough' messaging"
    },
    {
      id: "congruence_over_performance",
      label: "Congruence Over Performance",
      description: "Calling out performative wellness, critique toxic positivity",
      content_style: "Myth-busting, challenging trends, 'what we don't talk about'"
    }
  ],
  "integrity": [
    {
      id: "radical_honesty",
      label: "Radical Honesty",
      description: "Being direct with clients, even when uncomfortable",
      content_style: "Hard truths, 'what your therapist wishes they could say'"
    },
    {
      id: "clinical_ethics",
      label: "Clinical Ethics",
      description: "Maintaining clear professional boundaries and standards",
      content_style: "Professional guidance, ethical considerations, best practices"
    },
    {
      id: "modeling_accountability",
      label: "Modeling Accountability",
      description: "Taking responsibility, owning mistakes publicly",
      content_style: "Correction posts, 'I used to think X but now I know Y'"
    }
  ],
  "courage": [
    {
      id: "speaking_unpopular_truths",
      label: "Speaking Unpopular Truths",
      description: "Saying what others won't, challenging the status quo",
      content_style: "Hot takes, 'unpopular opinion', counter-narrative"
    },
    {
      id: "vulnerability_as_strength",
      label: "Vulnerability as Strength",
      description: "Showing up scared and doing it anyway",
      content_style: "Personal stories of fear, 'here's what terrified me'"
    },
    {
      id: "advocating_for_change",
      label: "Advocating for Change",
      description: "Standing up against systemic issues",
      content_style: "Advocacy content, systemic critique, calls to action"
    }
  ],
  "connection": [
    {
      id: "authentic_presence",
      label: "Authentic Presence",
      description: "Being fully present with clients, deep listening",
      content_style: "Relational content, 'what it means to be seen'"
    },
    {
      id: "community_building",
      label: "Community Building",
      description: "Creating spaces for people to connect",
      content_style: "Engagement posts, questions, creating conversation"
    },
    {
      id: "breaking_isolation",
      label: "Breaking Isolation",
      description: "Helping people feel less alone",
      content_style: "'Me too' content, normalization, shared experience"
    }
  ],
  "growth": [
    {
      id: "continuous_learning",
      label: "Continuous Learning",
      description: "Always evolving your practice and knowledge",
      content_style: "What I'm learning, book recommendations, new approaches"
    },
    {
      id: "embracing_discomfort",
      label: "Embracing Discomfort",
      description: "Growth happens at the edge of comfort",
      content_style: "Challenge content, pushing edges, 'try this hard thing'"
    },
    {
      id: "celebrating_progress",
      label: "Celebrating Progress",
      description: "Recognizing small wins and incremental change",
      content_style: "Progress over perfection, celebrating small steps"
    }
  ]
};
```

---

## Reference Content: Brand Archetypes

### The 8 Brand Archetypes

```javascript
const BRAND_ARCHETYPES = [
  {
    id: "sage",
    name: "The Sage",
    tagline: "Wisdom through understanding",
    description: "You lead with knowledge and research. Your content educates and illuminates, helping people understand the 'why' behind their experiences. You're the trusted expert who makes complex things accessible.",
    vibe_correlation: {
      clinical_relatable: [0, 40],      // Leans clinical
      scientific_holistic: [0, 40],     // Leans scientific
      quiet_energetic: [20, 60]         // More thoughtful than loud
    },
    content_style: {
      strengths: ["Deep dives", "Research summaries", "Nuanced explanations", "Myth-busting with evidence"],
      tone: "Thoughtful, measured, authoritative but accessible",
      example_hooks: [
        "Here's what the research actually says about...",
        "The psychology behind why you...",
        "Most people misunderstand this about..."
      ]
    },
    voice_traits: ["Evidence-informed", "Nuanced", "Educational", "Thorough"]
  },
  {
    id: "healer",
    name: "The Healer",
    tagline: "Holding space for transformation",
    description: "You lead with compassion and nurturing presence. Your content creates safety and validation, helping people feel seen and held. You're the warm embrace that makes healing possible.",
    vibe_correlation: {
      clinical_relatable: [50, 100],    // Leans relatable
      quiet_energetic: [0, 40],         // Quiet, soothing
      scientific_holistic: [40, 80]     // Middle to holistic
    },
    content_style: {
      strengths: ["Validation", "Gentle invitations", "Creating safety", "Normalization"],
      tone: "Warm, soft, nurturing, unconditionally accepting",
      example_hooks: [
        "It makes sense that you feel...",
        "You're not broken, you're...",
        "A gentle reminder that..."
      ]
    },
    voice_traits: ["Nurturing", "Validating", "Soft", "Unconditional"]
  },
  {
    id: "guide",
    name: "The Guide",
    tagline: "Walking alongside you",
    description: "You lead as a fellow traveler who's been there. Your content shares the journey, not from above but from beside. You're the relatable peer who makes people feel less alone.",
    vibe_correlation: {
      clinical_relatable: [60, 100],    // Very relatable
      expert_guide: [60, 100],          // Guide over expert
      quiet_energetic: [30, 70]         // Balanced energy
    },
    content_style: {
      strengths: ["Personal stories", "Shared struggles", "Practical wisdom", "Peer support"],
      tone: "Relatable, personal, 'been there' energy, conversational",
      example_hooks: [
        "Here's what I wish someone had told me...",
        "I used to struggle with this too...",
        "Something I learned the hard way..."
      ]
    },
    voice_traits: ["Relatable", "Personal", "Humble", "Companionate"]
  },
  {
    id: "challenger",
    name: "The Challenger",
    tagline: "Disrupting what doesn't serve you",
    description: "You lead with truth-telling and provocation. Your content calls out what's not working and challenges conventional wisdom. You're the voice that gives people permission to question everything.",
    vibe_correlation: {
      quiet_energetic: [60, 100],       // High energy
      clinical_relatable: [30, 70],     // Can be either
      formal_playful: [40, 80]          // Some edge
    },
    content_style: {
      strengths: ["Hot takes", "Myth-busting", "Calling out BS", "Counter-narratives"],
      tone: "Direct, provocative, unapologetic, permission-giving",
      example_hooks: [
        "Unpopular opinion:",
        "We need to talk about...",
        "Stop telling yourself that...",
        "The lie we've all been sold about..."
      ]
    },
    voice_traits: ["Direct", "Provocative", "Bold", "Truth-telling"]
  },
  {
    id: "alchemist",
    name: "The Alchemist",
    tagline: "Transforming pain into power",
    description: "You lead with vision of what's possible. Your content sees the gold in the shadow, the growth in the struggle. You're the one who helps people reimagine their story.",
    vibe_correlation: {
      scientific_holistic: [50, 100],   // Leans holistic
      clinical_relatable: [40, 80],     // Middle ground
      quiet_energetic: [40, 80]         // Can vary
    },
    content_style: {
      strengths: ["Reframing", "Finding meaning", "Possibility thinking", "Integration work"],
      tone: "Visionary, hopeful, transformative, seeing potential",
      example_hooks: [
        "What if this struggle is actually...",
        "The gift hidden in your...",
        "Imagine if you could..."
      ]
    },
    voice_traits: ["Visionary", "Hopeful", "Integrative", "Possibility-focused"]
  },
  {
    id: "anchor",
    name: "The Anchor",
    tagline: "Grounded stability in the storm",
    description: "You lead with steadiness and practical wisdom. Your content provides solid ground and actionable tools. You're the calm in the chaos that people can depend on.",
    vibe_correlation: {
      quiet_energetic: [0, 40],         // Calm, steady
      clinical_relatable: [30, 60],     // Balanced
      scientific_holistic: [20, 60]     // Leans practical
    },
    content_style: {
      strengths: ["Practical tools", "Step-by-step guidance", "Grounding techniques", "Reliability"],
      tone: "Calm, steady, reassuring, practical",
      example_hooks: [
        "Here's a simple tool you can use today...",
        "When everything feels chaotic, start here...",
        "Three things you can do right now..."
      ]
    },
    voice_traits: ["Steady", "Practical", "Grounding", "Reliable"]
  },
  {
    id: "liberator",
    name: "The Liberator",
    tagline: "Breaking chains, building freedom",
    description: "You lead with a vision of liberation and justice. Your content challenges systems and empowers people to break free from what constrains them. You're the voice for those finding their own.",
    vibe_correlation: {
      quiet_energetic: [50, 100],       // Higher energy
      scientific_holistic: [40, 100],   // Can vary
      clinical_relatable: [50, 100]     // More relatable
    },
    content_style: {
      strengths: ["Systemic critique", "Empowerment", "Challenging norms", "Advocacy"],
      tone: "Empowering, justice-oriented, systemic, liberating",
      example_hooks: [
        "You were never meant to...",
        "The system wasn't built for...",
        "It's time to stop accepting..."
      ]
    },
    voice_traits: ["Empowering", "Justice-minded", "Liberating", "Systemic"]
  },
  {
    id: "weaver",
    name: "The Weaver",
    tagline: "Connection as medicine",
    description: "You lead with community and connection. Your content brings people together and emphasizes the relational nature of healing. You're the one who reminds us we're not meant to do this alone.",
    vibe_correlation: {
      clinical_relatable: [50, 100],    // Relatable
      quiet_energetic: [30, 70],        // Balanced
      expert_guide: [50, 100]           // Guide energy
    },
    content_style: {
      strengths: ["Community building", "Relational wisdom", "'We' language", "Interdependence"],
      tone: "Inclusive, connecting, community-focused, interdependent",
      example_hooks: [
        "We're all navigating...",
        "You're not the only one who...",
        "Together, we can..."
      ]
    },
    voice_traits: ["Connecting", "Inclusive", "Community-focused", "Relational"]
  }
];
```

### Archetype Blending Logic

```javascript
function determineArchetype(vibeSliders, values) {
  // Score each archetype based on vibe correlation
  const scores = BRAND_ARCHETYPES.map(archetype => {
    let score = 0;
    let matchCount = 0;

    for (const [slider, range] of Object.entries(archetype.vibe_correlation)) {
      const value = vibeSliders[slider];
      if (value !== null) {
        matchCount++;
        const [min, max] = range;
        if (value >= min && value <= max) {
          // Perfect match gets full points
          score += 100;
        } else {
          // Partial credit based on distance
          const distance = value < min ? min - value : value - max;
          score += Math.max(0, 100 - distance * 2);
        }
      }
    }

    // Normalize by match count
    const normalizedScore = matchCount > 0 ? score / matchCount : 0;

    // Boost score if values align
    const valueBoost = calculateValueBoost(archetype.id, values);

    return {
      archetype,
      score: normalizedScore + valueBoost
    };
  });

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  const primary = scores[0];
  const secondary = scores[1].score > 60 ? scores[1] : null;

  return { primary, secondary };
}

function calculateValueBoost(archetypeId, values) {
  const VALUE_ARCHETYPE_AFFINITY = {
    sage: ["wisdom", "curiosity", "mastery", "excellence"],
    healer: ["compassion", "empathy", "presence", "service"],
    guide: ["connection", "authenticity", "vulnerability", "generosity"],
    challenger: ["courage", "honesty", "justice", "freedom"],
    alchemist: ["transformation", "creativity", "growth", "wisdom"],
    anchor: ["groundedness", "balance", "peace", "simplicity"],
    liberator: ["freedom", "justice", "courage", "autonomy"],
    weaver: ["connection", "community", "belonging", "empathy"]
  };

  const affinityValues = VALUE_ARCHETYPE_AFFINITY[archetypeId] || [];
  const powerFive = values.power_five?.map(v => v.value) || [];

  let boost = 0;
  for (const value of powerFive) {
    if (affinityValues.includes(value)) {
      boost += 15;
    }
  }

  return Math.min(boost, 45); // Cap at 45 points
}
```

---

## Reference Content: Audience Archetypes

```javascript
const AUDIENCE_ARCHETYPES = [
  {
    id: "cycle_breaker",
    name: "The Cycle Breaker",
    description: "Working through generational patterns. Wants to do it differently than their parents. Often the 'first' in their family to seek therapy.",
    pain_point: "I don't want to repeat what was done to me",
    desire: "Break the chain, do it differently for my kids",
    content_hooks: ["generational trauma", "reparenting", "breaking patterns", "family systems"],
    demographics_hint: "Often 25-45, becoming parents or recently parented"
  },
  {
    id: "overwhelmed_achiever",
    name: "The Overwhelmed High-Achiever",
    description: "Successful on paper, drowning inside. Perfectionist who feels guilty for struggling when life 'looks good.'",
    pain_point: "I should be grateful but I'm exhausted",
    desire: "Permission to not be fine, sustainable success",
    content_hooks: ["burnout", "perfectionism", "high-functioning anxiety", "imposter syndrome"],
    demographics_hint: "Often professionals, entrepreneurs, healthcare workers"
  },
  {
    id: "late_diagnosed",
    name: "The Late-Diagnosed",
    description: "Recently discovered ADHD/autism/etc. Reframing their entire life story. Grieving and relieved simultaneously.",
    pain_point: "My whole life makes sense now but I'm grieving the years I lost",
    desire: "Reframe their story, find their people",
    content_hooks: ["ADHD", "autism", "neurodivergence", "late diagnosis", "unmasking"],
    demographics_hint: "Often 30+, many are women/AFAB discovering in adulthood"
  },
  {
    id: "people_pleaser",
    name: "The People-Pleaser in Recovery",
    description: "Learning boundaries for the first time. Terrified of being 'selfish.' Unlearning fawn responses.",
    pain_point: "I don't know who I am without taking care of everyone else",
    desire: "Find themselves, learn to say no",
    content_hooks: ["boundaries", "fawn response", "codependency", "self-abandonment"],
    demographics_hint: "Often raised in chaotic/enmeshed families"
  },
  {
    id: "burnt_out_caregiver",
    name: "The Burnt-Out Caregiver",
    description: "Healthcare worker, parent, sandwich generation. Gives to everyone but themselves.",
    pain_point: "I have nothing left to give",
    desire: "Sustainable caregiving, permission to rest",
    content_hooks: ["compassion fatigue", "caregiver burnout", "sandwich generation", "self-care guilt"],
    demographics_hint: "Often nurses, therapists, teachers, parents of young kids or aging parents"
  },
  {
    id: "quarter_life",
    name: "The Quarter-Life Questioner",
    description: "25-35, 'is this it?' energy. Did everything 'right' and still feels lost.",
    pain_point: "I followed the script and I'm still unfulfilled",
    desire: "Authentic direction, permission to pivot",
    content_hooks: ["quarter-life crisis", "career change", "purpose", "authenticity"],
    demographics_hint: "Often college-educated, facing first major life disillusionment"
  },
  {
    id: "empty_nester",
    name: "The Empty Nester Reinventing",
    description: "Kids launched, now what? Identity was wrapped up in parenting.",
    pain_point: "I don't know who I am outside of being a parent",
    desire: "Reclaim identity, find purpose in next chapter",
    content_hooks: ["empty nest", "midlife", "identity", "reinvention", "marriage after kids"],
    demographics_hint: "Often 45-60, may also be navigating relationship changes"
  },
  {
    id: "pattern_repeater",
    name: "The Relationship Pattern Repeater",
    description: "Same dynamics, different partners. Keeps attracting the same problems.",
    pain_point: "Why do I keep choosing this?",
    desire: "Break the pattern, healthy relationship",
    content_hooks: ["attachment styles", "relationship patterns", "dating", "partner selection"],
    demographics_hint: "Often post-breakup or mid-relationship crisis"
  },
  {
    id: "high_functioning_anxious",
    name: "The High-Functioning Anxious",
    description: "Looks fine on the outside, white-knuckling everything internally.",
    pain_point: "No one knows how hard I'm working to seem okay",
    desire: "Actually be okay, not just look okay",
    content_hooks: ["high-functioning anxiety", "hidden anxiety", "nervous system", "somatic"],
    demographics_hint: "Often successful, 'has it together' externally"
  },
  {
    id: "spiritual_seeker",
    name: "The Spiritual Seeker",
    description: "Meaning-hungry, exploring beyond traditional frameworks.",
    pain_point: "There has to be more than this",
    desire: "Deeper connection, meaning, transcendence",
    content_hooks: ["spirituality", "meaning", "purpose", "existential", "soul"],
    demographics_hint: "May be post-religious or integrating spirituality with therapy"
  },
  {
    id: "career_pivoter",
    name: "The Career Pivoter",
    description: "Successful at something they hate. Ready to make a change but scared.",
    pain_point: "I'm successful at something that's killing my soul",
    desire: "Aligned work, purpose-driven career",
    content_hooks: ["career change", "purpose", "values alignment", "golden handcuffs"],
    demographics_hint: "Often mid-career, financially comfortable but unfulfilled"
  },
  {
    id: "identity_excavator",
    name: "The Identity Excavator",
    description: "Post-divorce, post-loss, post-transition. Rebuilding from scratch.",
    pain_point: "I don't know who I am anymore",
    desire: "Rebuild self, find new identity",
    content_hooks: ["identity", "divorce recovery", "grief", "starting over", "who am I"],
    demographics_hint: "Going through or recently through major life transition"
  }
];
```

---

## Reference Content: Modalities & Specialties

### Modalities List

```javascript
const MODALITIES = {
  clinical_cognitive: {
    label: "Cognitive & Behavioral",
    therapist_focused: true,
    items: [
      { id: "cbt", name: "CBT (Cognitive Behavioral Therapy)" },
      { id: "dbt", name: "DBT (Dialectical Behavior Therapy)" },
      { id: "act", name: "ACT (Acceptance & Commitment Therapy)" },
      { id: "rebt", name: "REBT (Rational Emotive Behavior Therapy)" },
      { id: "cbt_i", name: "CBT-I (for Insomnia)" }
    ]
  },
  clinical_trauma: {
    label: "Trauma-Focused",
    therapist_focused: true,
    items: [
      { id: "emdr", name: "EMDR" },
      { id: "se", name: "Somatic Experiencing" },
      { id: "ifs", name: "IFS (Internal Family Systems)" },
      { id: "brainspotting", name: "Brainspotting" },
      { id: "cpt", name: "CPT (Cognitive Processing Therapy)" },
      { id: "pe", name: "Prolonged Exposure" }
    ]
  },
  clinical_relational: {
    label: "Relational & Couples",
    therapist_focused: true,
    items: [
      { id: "eft", name: "EFT (Emotionally Focused Therapy)" },
      { id: "gottman", name: "Gottman Method" },
      { id: "attachment", name: "Attachment-Based Therapy" },
      { id: "psychodynamic", name: "Psychodynamic" },
      { id: "relational", name: "Relational Therapy" }
    ]
  },
  clinical_humanistic: {
    label: "Humanistic & Existential",
    therapist_focused: true,
    items: [
      { id: "person_centered", name: "Person-Centered" },
      { id: "gestalt", name: "Gestalt" },
      { id: "existential", name: "Existential" },
      { id: "narrative", name: "Narrative Therapy" },
      { id: "solution_focused", name: "Solution-Focused Brief Therapy" }
    ]
  },
  clinical_specialized: {
    label: "Specialized Therapies",
    therapist_focused: true,
    items: [
      { id: "play_therapy", name: "Play Therapy" },
      { id: "art_therapy", name: "Art Therapy" },
      { id: "sandtray", name: "Sandtray Therapy" },
      { id: "emdr_kids", name: "EMDR for Children" },
      { id: "tfcbt", name: "TF-CBT (Trauma-Focused CBT)" }
    ]
  },
  coaching_core: {
    label: "Coaching Approaches",
    coach_focused: true,
    items: [
      { id: "icf", name: "ICF-Style Coaching" },
      { id: "coactive", name: "Co-Active Coaching" },
      { id: "ontological", name: "Ontological Coaching" },
      { id: "positive_psych", name: "Positive Psychology Coaching" },
      { id: "nlp", name: "NLP (Neuro-Linguistic Programming)" }
    ]
  },
  coaching_specialized: {
    label: "Specialized Coaching",
    coach_focused: true,
    items: [
      { id: "executive", name: "Executive Coaching" },
      { id: "leadership", name: "Leadership Coaching" },
      { id: "career", name: "Career Coaching" },
      { id: "life", name: "Life Coaching" },
      { id: "health_wellness", name: "Health & Wellness Coaching" },
      { id: "relationship_coaching", name: "Relationship Coaching" }
    ]
  },
  somatic: {
    label: "Body-Based Approaches",
    therapist_focused: true,
    coach_focused: true,
    items: [
      { id: "somatic", name: "Somatic Therapy/Coaching" },
      { id: "breathwork", name: "Breathwork" },
      { id: "yoga_therapy", name: "Yoga Therapy" },
      { id: "tre", name: "TRE (Trauma Release Exercises)" },
      { id: "polyvagal", name: "Polyvagal-Informed" },
      { id: "sensorimotor", name: "Sensorimotor Psychotherapy" }
    ]
  },
  mindfulness: {
    label: "Mindfulness-Based",
    therapist_focused: true,
    coach_focused: true,
    items: [
      { id: "mbsr", name: "MBSR (Mindfulness-Based Stress Reduction)" },
      { id: "mbct", name: "MBCT (Mindfulness-Based Cognitive Therapy)" },
      { id: "mindfulness", name: "Mindfulness Integration" },
      { id: "meditation", name: "Meditation Teaching" }
    ]
  }
};
```

### Specialties List

```javascript
const SPECIALTIES = {
  mental_health: {
    label: "Mental Health Conditions",
    items: [
      { id: "anxiety", name: "Anxiety", subtypes: ["generalized", "social", "panic", "phobias", "health_anxiety"] },
      { id: "depression", name: "Depression" },
      { id: "trauma_ptsd", name: "Trauma & PTSD" },
      { id: "cptsd", name: "Complex PTSD" },
      { id: "ocd", name: "OCD" },
      { id: "adhd", name: "ADHD" },
      { id: "bipolar", name: "Bipolar Disorder" },
      { id: "eating_disorders", name: "Eating Disorders" },
      { id: "addiction", name: "Addiction & Recovery" },
      { id: "grief", name: "Grief & Loss" },
      { id: "dissociation", name: "Dissociation" }
    ]
  },
  life_challenges: {
    label: "Life Challenges",
    items: [
      { id: "relationships", name: "Relationship Issues" },
      { id: "divorce", name: "Divorce & Separation" },
      { id: "parenting", name: "Parenting" },
      { id: "infertility", name: "Infertility & Perinatal" },
      { id: "postpartum", name: "Postpartum" },
      { id: "career", name: "Career & Work Issues" },
      { id: "life_transitions", name: "Life Transitions" },
      { id: "identity", name: "Identity & Self-Worth" },
      { id: "spiritual", name: "Spiritual/Existential" },
      { id: "chronic_illness", name: "Chronic Illness" }
    ]
  },
  patterns: {
    label: "Patterns & Growth Areas",
    items: [
      { id: "burnout", name: "Burnout" },
      { id: "perfectionism", name: "Perfectionism" },
      { id: "people_pleasing", name: "People-Pleasing" },
      { id: "boundaries", name: "Boundary Setting" },
      { id: "imposter_syndrome", name: "Imposter Syndrome" },
      { id: "procrastination", name: "Procrastination" },
      { id: "communication", name: "Communication Skills" },
      { id: "self_esteem", name: "Self-Esteem" },
      { id: "stress", name: "Stress Management" },
      { id: "anger", name: "Anger Management" }
    ]
  },
  populations: {
    label: "Populations",
    items: [
      { id: "lgbtq", name: "LGBTQ+" },
      { id: "bipoc", name: "BIPOC" },
      { id: "women", name: "Women's Issues" },
      { id: "men", name: "Men's Issues" },
      { id: "teens", name: "Teens/Adolescents" },
      { id: "college", name: "College Students" },
      { id: "professionals", name: "Professionals/Executives" },
      { id: "creatives", name: "Creatives/Artists" },
      { id: "entrepreneurs", name: "Entrepreneurs" },
      { id: "healthcare_workers", name: "Healthcare Workers" }
    ]
  }
};
```

---

## Reference Content: Platforms

```javascript
const PLATFORMS = [
  {
    id: "linkedin",
    name: "LinkedIn",
    vibe: "Professional/Authoritative",
    description: "Long-form thought leadership, professional credibility",
    content_types: ["articles", "carousels", "text posts"],
    character_limits: { post: 3000, article: null }
  },
  {
    id: "instagram",
    name: "Instagram",
    vibe: "Visual/Aesthetic",
    description: "Carousel education, reels, aesthetic quotes",
    content_types: ["carousels", "reels", "stories", "single image"],
    character_limits: { caption: 2200, bio: 150 }
  },
  {
    id: "twitter",
    name: "Twitter/X",
    vibe: "Punchy/Conversational",
    description: "Hot takes, threads, quick insights",
    content_types: ["tweets", "threads"],
    character_limits: { tweet: 280, thread_tweet: 280 }
  },
  {
    id: "facebook",
    name: "Facebook",
    vibe: "Community/Personal",
    description: "Longer posts, community engagement, groups",
    content_types: ["posts", "lives", "groups"],
    character_limits: { post: 63206 }
  },
  {
    id: "email",
    name: "Email Newsletter",
    vibe: "Intimate/Nurturing",
    description: "Deep dives, personal stories, exclusive content",
    content_types: ["newsletter", "sequences"],
    character_limits: null
  },
  {
    id: "tiktok",
    name: "TikTok/Reels",
    vibe: "Casual/Authentic",
    description: "Short-form video, trends, raw authenticity",
    content_types: ["short video"],
    character_limits: { caption: 2200 }
  },
  {
    id: "threads",
    name: "Threads",
    vibe: "Conversational/Casual",
    description: "Text-based social, casual conversation",
    content_types: ["posts"],
    character_limits: { post: 500 }
  },
  {
    id: "youtube",
    name: "YouTube",
    vibe: "Educational/Evergreen",
    description: "Long-form video, searchable content",
    content_types: ["long video", "shorts"],
    character_limits: { title: 100, description: 5000 }
  }
];
```

---

## AI Prompts

### Scrape Analysis Prompt

```markdown
# Website Analysis for Therapist/Coach Profile

Analyze the following website content and extract structured information about this therapist or coach.

## Content to Analyze

### Homepage
{{HOMEPAGE_CONTENT}}

### About Page
{{ABOUT_CONTENT}}

### Services Page
{{SERVICES_CONTENT}}

## Extraction Tasks

Return a JSON object with the following structure:

```json
{
  "identity": {
    "name": "Full name if found",
    "name_confidence": 0.0-1.0,
    "credentials": "Degrees and certifications (e.g., PhD, LMFT, PCC)",
    "credentials_confidence": 0.0-1.0,
    "title": "Professional title (e.g., Licensed Therapist, Executive Coach)",
    "title_confidence": 0.0-1.0,
    "bio_excerpt": "First 2-3 sentences of their bio/about",
    "bio_confidence": 0.0-1.0
  },
  "services": {
    "modalities": ["List of therapeutic/coaching approaches mentioned"],
    "modalities_confidence": 0.0-1.0,
    "specialties": ["List of issues/populations they work with"],
    "specialties_confidence": 0.0-1.0,
    "service_format": ["1:1", "groups", "courses", "etc."],
    "service_format_confidence": 0.0-1.0
  },
  "audience_signals": {
    "who_they_serve": "Description of their ideal client",
    "pain_points_addressed": ["List of problems they help with"],
    "language_used": ["Key phrases they use to describe clients"],
    "confidence": 0.0-1.0
  },
  "tone_analysis": {
    "formal_casual": 1-10,
    "clinical_relatable": 1-10,
    "scientific_holistic": 1-10,
    "expert_peer": 1-10,
    "confidence": 0.0-1.0,
    "sample_phrases": ["3-5 phrases that capture their voice"]
  },
  "themes": {
    "recurring_topics": ["Topics that appear multiple times"],
    "values_signals": ["Values they seem to emphasize"],
    "unique_perspective": "What makes their approach distinct",
    "confidence": 0.0-1.0
  }
}
```

## Guidelines

- Only include fields where you have reasonable confidence
- Set confidence scores honestly (0.5 = uncertain, 0.8+ = confident)
- For tone_analysis scales: 1 = strongly first trait, 10 = strongly second trait, 5 = balanced
- Extract verbatim phrases for sample_phrases
- If content is missing or unclear, set the field to null with low confidence
- Distinguish between therapists (clinical terms) and coaches (growth/performance terms)
```

### Values Nuance Generation Prompt

```markdown
# Generate Value Nuance Options

The user selected "{{VALUE_NAME}}" as one of their core values in a brand discovery exercise for therapists/coaches.

Generate 3 distinct "flavors" or interpretations of how this value might show up in their work and content. Each flavor should represent a genuinely different way of expressing this value.

## Guidelines

- Each flavor should feel distinct, not just synonyms
- Consider how this value translates to content creation
- Think about what kind of content each flavor would produce
- Make the descriptions specific enough to be meaningful choices

## Output Format

Return JSON:

```json
{
  "value": "{{VALUE_NAME}}",
  "nuances": [
    {
      "id": "snake_case_id",
      "label": "Short Label (2-4 words)",
      "description": "One sentence explaining this interpretation",
      "content_style": "How this shows up in their content",
      "example_hook": "An example post hook using this flavor"
    },
    {
      "id": "...",
      "label": "...",
      "description": "...",
      "content_style": "...",
      "example_hook": "..."
    },
    {
      "id": "...",
      "label": "...",
      "description": "...",
      "content_style": "...",
      "example_hook": "..."
    }
  ]
}
```
```

### Brand DNA Synthesis Prompt

```markdown
# Brand DNA Synthesis

Synthesize a Brand DNA profile for a therapist/coach based on their completed brand discovery modules.

## Input Data

### Vibe Sliders (0-100 scale)
{{VIBE_SLIDERS}}

### Core Values (Power Five with Nuances)
{{VALUES_DATA}}

### Method (Modalities & Specialties)
{{METHOD_DATA}}

### Audience (Selected Archetypes)
{{AUDIENCE_DATA}}

### Channel Priorities
{{CHANNELS_DATA}}

### Scraped/Inferred Data (if available)
{{INFERRED_DATA}}

## Archetype Reference

{{ARCHETYPE_DEFINITIONS}}

## Synthesis Tasks

Generate a comprehensive Brand DNA that will guide AI content generation.

### Output Format

```json
{
  "archetype": {
    "primary_id": "archetype_id",
    "secondary_id": "archetype_id or null",
    "blended_name": "Creative name combining both (e.g., 'The Grounded Challenger')",
    "blended_description": "2-3 sentence description of their unique brand voice",
    "reasoning": "Brief explanation of why these archetypes fit"
  },
  "brand_promise": {
    "filled": "I help [audience] who struggle with [pain] to [outcome] through [method]",
    "parts": {
      "audience": "...",
      "pain_point": "...",
      "outcome": "...",
      "method": "..."
    }
  },
  "content_pillars": [
    {
      "name": "Pillar name",
      "description": "What this pillar covers",
      "content_types": ["Types of content that fit"],
      "example_topics": ["Specific topic ideas"]
    }
  ],
  "voice_characteristics": [
    {
      "trait": "Trait name",
      "description": "How this shows up",
      "do": "What to do",
      "dont": "What to avoid"
    }
  ],
  "anti_patterns": [
    {
      "pattern": "What to avoid",
      "why": "Why it doesn't fit",
      "instead": "What to do instead"
    }
  ],
  "ai_directives": {
    "system_prompt_additions": [
      "Specific instructions for AI content generation"
    ],
    "temperature_hint": 0.7,
    "content_preferences": {
      "look_for": ["What to emphasize in their content"],
      "avoid": ["What to skip or downplay"],
      "framing": "How to frame their content"
    },
    "platform_adaptations": {
      "linkedin": {
        "tone_shift": "How to adapt for LinkedIn",
        "emphasis": "What to emphasize"
      },
      "instagram": {
        "tone_shift": "How to adapt for Instagram",
        "emphasis": "What to emphasize"
      }
    }
  }
}
```

## Guidelines

- Be specific and actionable, not generic
- The ai_directives.system_prompt_additions should be direct instructions
- Content pillars should be distinct and useful for categorizing content
- Voice characteristics should translate to concrete writing choices
- Anti-patterns should be specific to this person, not generic bad writing
```

---

## UI Specifications

### Brand Discovery Studio Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BRAND DISCOVERY STUDIO                                                  │
│                                                                          │
│  Your brand profile is 42% complete                                     │
│  ━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MODULE GRID (2x3 or responsive)                                 │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ 🌐 SOURCES  │  │ 🎭 VIBE     │  │ 💎 VALUES   │              │   │
│  │  │ Import your │  │ Set your    │  │ Discover    │              │   │
│  │  │ web presence│  │ personality │  │ your core   │              │   │
│  │  │             │  │ sliders     │  │ values      │              │   │
│  │  │ ✓ Complete  │  │ ◐ Partial   │  │ ○ Start     │              │   │
│  │  │             │  │ 2/6 set     │  │             │              │   │
│  │  │ [Review]    │  │ [Continue]  │  │ [Begin]     │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ 🎯 METHOD   │  │ 👥 AUDIENCE │  │ 📣 CHANNELS │              │   │
│  │  │ Your        │  │ Who you     │  │ Where you   │              │   │
│  │  │ approaches  │  │ serve       │  │ show up     │              │   │
│  │  │             │  │             │  │             │              │   │
│  │  │ ○ Start     │  │ ○ Start     │  │ ○ Start     │              │   │
│  │  │             │  │             │  │             │              │   │
│  │  │ [Begin]     │  │ [Begin]     │  │ [Begin]     │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  💡 BRAND DNA PREVIEW                                            │   │
│  │                                                                   │   │
│  │  [If < 2 modules complete:]                                      │   │
│  │  Complete 2 more modules to unlock your Brand DNA synthesis     │   │
│  │                                                                   │   │
│  │  [If >= 2 modules complete:]                                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ Archetype: The Grounded Challenger                       │    │   │
│  │  │ "You combine evidence-based approaches with..."          │    │   │
│  │  │                                                          │    │   │
│  │  │ Brand Promise: I help overwhelmed high-achievers...      │    │   │
│  │  │                                                          │    │   │
│  │  │ [View Full DNA] [Regenerate]                             │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Module Card States

```
NOT STARTED:
┌─────────────────────┐
│ 🎭 VIBE             │
│                     │
│ Set your brand      │
│ personality through │
│ interactive sliders │
│                     │
│ ○ Not started       │
│                     │
│ [Begin →]           │
└─────────────────────┘

PARTIAL:
┌─────────────────────┐
│ 🎭 VIBE             │
│                     │
│ You've set 2 of 6   │
│ personality sliders │
│                     │
│ ◐ In progress       │
│ ━━━━━░░░░░ 33%     │
│                     │
│ [Continue →]        │
└─────────────────────┘

COMPLETE:
┌─────────────────────┐
│ 🎭 VIBE        ✓   │
│                     │
│ Your brand vibe:    │
│ "Warm Challenger"   │
│                     │
│ ✓ Complete          │
│                     │
│ [Review] [Edit]     │
└─────────────────────┘
```

### Vibe Slider Component

```
┌─────────────────────────────────────────────────────────────────────┐
│  Clinical/Academic                        Relatable/Lived Experience│
│                                                                      │
│  Research-focused,          ○─────────────●───────────○        "I've│
│  evidence-based,                          65                  been  │
│  professional                                               there"  │
│  language                                                   energy  │
│                                                                      │
│  ────────────────────────────────────────────────────────────────── │
│                                                                      │
│  Quiet/Soothing                               High-Energy/Challenger│
│                                                                      │
│  Gentle, calming,           ○───────●─────────────────○      Bold,  │
│  soft invitations                   40                      direct, │
│                                                            provocat.│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Values Card Swipe Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│  Which values resonate with your work?                              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │     ← Swipe left                      Swipe right →         │   │
│  │        NOT ME                              ME               │   │
│  │                                                              │   │
│  │              ╔═══════════════════════════════╗              │   │
│  │              ║                               ║              │   │
│  │              ║         AUTHENTICITY          ║              │   │
│  │              ║                               ║              │   │
│  │              ║   Being genuine and true to   ║              │   │
│  │              ║   yourself and others         ║              │   │
│  │              ║                               ║              │   │
│  │              ╚═══════════════════════════════╝              │   │
│  │                                                              │   │
│  │                    [Skip this card]                         │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Progress: ━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░  12/30                  │
│                                                                      │
│  Your "Me" pile: 8 values                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Backend:**
- [ ] Create `brand_discovery` table and migrations
- [ ] Create `/api/brand-discovery` routes (GET, PATCH)
- [ ] Implement Sources module with basic scraping (Firecrawl)
- [ ] Implement scrape analysis with Haiku
- [ ] Implement Vibe module (just saves slider positions)
- [ ] Implement inference confirmation API

**Frontend:**
- [ ] Create BrandDiscoveryStudio component
- [ ] Create ModuleCard component with states
- [ ] Create SourcesModule (URL input, scrape status)
- [ ] Create VibeModule (6 sliders)
- [ ] Create CompletionProgress component
- [ ] Integrate into Settings page as new section

### Phase 2: Values & Method

**Backend:**
- [ ] Implement values nuance generation (Haiku)
- [ ] Implement Method module API

**Frontend:**
- [ ] Create ValuesModule (swipe UI, ranking, AI why)
- [ ] Create MethodModule (modality/specialty selection)
- [ ] Create InferenceConfirmation component

### Phase 3: Brand DNA

**Backend:**
- [ ] Implement Brand DNA synthesis (Sonnet)
- [ ] Implement regeneration logic
- [ ] Implement version history

**Frontend:**
- [ ] Create BrandDNAPreview component
- [ ] Create full Brand DNA view modal
- [ ] Add regenerate functionality

### Phase 4: Audience & Channels

**Backend:**
- [ ] Implement Audience module API
- [ ] Implement Channels module API

**Frontend:**
- [ ] Create AudienceModule (archetype selection)
- [ ] Create ChannelsModule (drag-and-drop ranking)

### Phase 5: Pipeline Integration

**Backend:**
- [ ] Modify episode processing to include Brand DNA
- [ ] Update prompts to use Brand DNA directives
- [ ] Add Brand DNA to stage context

**Frontend:**
- [ ] Show Brand DNA summary in episode processing
- [ ] Add "Brand DNA applied" indicator to generated content

---

## Testing Checklist

### Sources Module
- [ ] URL input validation
- [ ] Scrape initiation and status polling
- [ ] Scrape failure handling
- [ ] Inference display and confirmation
- [ ] Multiple URL support

### Vibe Module
- [ ] Slider interaction (touch and mouse)
- [ ] Null vs. 50 distinction
- [ ] Partial save (some sliders set)
- [ ] Complete save

### Values Module
- [ ] Card swipe gesture recognition
- [ ] Me/Not Me pile tracking
- [ ] Power Five ranking drag-and-drop
- [ ] AI Why generation and selection
- [ ] Partial completion (swipe done, ranking not)

### Method Module
- [ ] Category expansion/collapse
- [ ] Multi-select behavior
- [ ] Custom entry addition
- [ ] Inference pre-checking
- [ ] Save and clear

### Brand DNA
- [ ] Synthesis trigger on module completion
- [ ] Minimum module requirement (2+)
- [ ] Regeneration on demand
- [ ] Version history creation
- [ ] Edit/override functionality

---

**This implementation guide should be used alongside BRAND-DISCOVERY-ARCHITECTURE.md for complete system documentation.**
