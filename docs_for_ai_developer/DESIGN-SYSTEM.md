# Design System

## Design Philosophy

**Elegant. Soothing. Professional.**

This application embodies warmth and sophistication—like a well-appointed therapist's office. The design should feel calming, trustworthy, and refined without being cold or clinical.

**Visual Metaphors:**
- A carefully curated library
- Handwritten notes on cream paper
- Afternoon light through linen curtains
- Warm wood and soft textiles

---

## Color Palette

### Primary Colors

```css
/* Warm neutrals - the foundation */
--color-cream: #F5F1E8;           /* Main background */
--color-linen: #E8E1D3;           /* Secondary background */
--color-sand: #D4C4B0;            /* Tertiary background */
--color-taupe: #C9B8A3;           /* Borders, dividers */

/* Accent colors - sparingly */
--color-terracotta: #C88B6F;      /* Primary actions, links */
--color-terracotta-dark: #B47A5E; /* Hover states */
--color-terracotta-light: #E8C4B4;/* Light accents */

/* Text colors */
--color-charcoal: #2D2D2D;        /* Primary text */
--color-charcoal-medium: #5A5A5A; /* Secondary text */
--color-charcoal-light: #8B8B8B;  /* Tertiary text, placeholders */

/* Semantic colors */
--color-sage: #8B9D7C;            /* Success states */
--color-sage-light: #C5D4BA;      /* Success backgrounds */
--color-rose: #C97C7C;            /* Error states */
--color-rose-light: #E8C4C4;      /* Error backgrounds */
--color-amber: #D4A574;           /* Warning states */
--color-amber-light: #F0D9BA;     /* Warning backgrounds */

/* Borders */
--color-border: #D9D5CC;          /* Subtle borders */
--color-border-dark: #C4BDB0;     /* Defined borders */
```

### Color Usage Guidelines

**Backgrounds:**
- Page background: `--color-cream`
- Card background: White with subtle shadow
- Hover backgrounds: `--color-linen`
- Selected/active: `--color-sand`

**Text:**
- Headings: `--color-charcoal`
- Body text: `--color-charcoal` at 90% opacity
- Secondary text: `--color-charcoal-medium`
- Disabled text: `--color-charcoal-light`

**Interactive Elements:**
- Primary buttons: `--color-terracotta`
- Links: `--color-terracotta`
- Focus rings: `--color-terracotta` at 40% opacity

**Feedback:**
- Success: `--color-sage`
- Error: `--color-rose`
- Warning: `--color-amber`
- Info: `--color-taupe`

---

## Typography

### Font Families

```css
/* Headings - Serif for elegance */
--font-heading: 'Lora', 'Crimson Text', 'Libre Baskerville', Georgia, serif;

/* Body - Sans-serif for readability */
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;

/* Code/Data - Monospace */
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
```

**Font Loading:**
```html
<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type Scale

```css
/* Headings */
--text-4xl: 2.5rem;    /* 40px - Page titles */
--text-3xl: 2rem;      /* 32px - Section headings */
--text-2xl: 1.5rem;    /* 24px - Card titles */
--text-xl: 1.25rem;    /* 20px - Subheadings */
--text-lg: 1.125rem;   /* 18px - Large body */

/* Body */
--text-base: 1rem;     /* 16px - Default */
--text-sm: 0.875rem;   /* 14px - Small text */
--text-xs: 0.75rem;    /* 12px - Captions */
```

### Font Weights

```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Line Heights

```css
--leading-tight: 1.2;    /* Headings */
--leading-normal: 1.5;   /* Body text */
--leading-relaxed: 1.75; /* Long-form content */
```

### Letter Spacing

```css
--tracking-tight: -0.01em;  /* Large headings */
--tracking-normal: 0;        /* Body text */
--tracking-wide: 0.02em;     /* Small caps, labels */
```

### Typography Usage

```css
/* Page Title */
h1 {
  font-family: var(--font-heading);
  font-size: var(--text-4xl);
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-charcoal);
}

/* Section Heading */
h2 {
  font-family: var(--font-heading);
  font-size: var(--text-3xl);
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
  color: var(--color-charcoal);
}

/* Card Title */
h3 {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: var(--font-medium);
  line-height: var(--leading-tight);
  color: var(--color-charcoal);
}

/* Body Text */
p {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
  color: var(--color-charcoal);
}

/* Small Text / Labels */
.text-small {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  line-height: var(--leading-normal);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-charcoal-medium);
}
```

---

## Spacing System

Based on 8px unit for consistency.

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px - base unit */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### Spacing Usage

- **Tight**: 4-8px (inline elements, icon spacing)
- **Default**: 16-24px (between related elements)
- **Comfortable**: 32-48px (between sections)
- **Generous**: 64-96px (page margins, major sections)

---

## Border Radius

Soft, approachable curves throughout.

```css
--radius-sm: 4px;     /* Inputs, badges */
--radius-md: 6px;     /* Buttons */
--radius-lg: 8px;     /* Cards */
--radius-xl: 12px;    /* Modals */
--radius-full: 9999px;/* Pills, avatars */
```

---

## Shadows

Subtle elevation for depth without harshness.

```css
/* Card shadow - gentle elevation */
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.06);

/* Hover shadow - slightly more prominent */
--shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.1);

/* Modal shadow - clear separation */
--shadow-modal: 0 8px 24px rgba(0, 0, 0, 0.12);

/* Focus shadow - for accessibility */
--shadow-focus: 0 0 0 3px rgba(200, 139, 111, 0.3);

/* Inset shadow - for inputs */
--shadow-inset: inset 0 1px 2px rgba(0, 0, 0, 0.05);
```

---

## Animation & Transitions

Smooth, soothing, never jarring.

```css
/* Durations */
--duration-fast: 150ms;    /* Quick feedback */
--duration-base: 200ms;    /* Standard transitions */
--duration-slow: 300ms;    /* Gentle animations */

/* Easing functions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);

/* Common transitions */
--transition-colors: color var(--duration-base) var(--ease-in-out),
                     background-color var(--duration-base) var(--ease-in-out),
                     border-color var(--duration-base) var(--ease-in-out);

--transition-transform: transform var(--duration-base) var(--ease-in-out);

--transition-all: all var(--duration-base) var(--ease-in-out);
```

---

## Component Styles

### Buttons

```css
/* Primary Button */
.btn-primary {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  padding: var(--space-3) var(--space-6);
  
  background-color: var(--color-terracotta);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  
  transition: var(--transition-colors), var(--transition-transform);
  cursor: pointer;
  
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.btn-primary:hover {
  background-color: var(--color-terracotta-dark);
  transform: translateY(-1px);
  box-shadow: var(--shadow-hover);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* Secondary Button */
.btn-secondary {
  background-color: transparent;
  color: var(--color-terracotta);
  border: 1.5px solid var(--color-taupe);
}

.btn-secondary:hover {
  background-color: var(--color-linen);
  border-color: var(--color-terracotta);
}

/* Ghost Button */
.btn-ghost {
  background-color: transparent;
  color: var(--color-charcoal);
  border: none;
  padding: var(--space-2) var(--space-4);
}

.btn-ghost:hover {
  background-color: var(--color-linen);
}

/* Danger Button */
.btn-danger {
  background-color: var(--color-rose);
}

.btn-danger:hover {
  background-color: #B46B6B;
}
```

### Inputs

```css
.input {
  font-family: var(--font-body);
  font-size: var(--text-base);
  padding: var(--space-3) var(--space-4);
  
  background-color: white;
  color: var(--color-charcoal);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  
  transition: var(--transition-colors);
  box-shadow: var(--shadow-inset);
}

.input:hover {
  border-color: var(--color-border-dark);
}

.input:focus {
  outline: none;
  border-color: var(--color-terracotta);
  box-shadow: var(--shadow-focus);
}

.input::placeholder {
  color: var(--color-charcoal-light);
  font-style: italic;
}

.input:disabled {
  background-color: var(--color-linen);
  color: var(--color-charcoal-light);
  cursor: not-allowed;
}
```

### Cards

```css
.card {
  background-color: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  
  box-shadow: var(--shadow-card);
  transition: var(--transition-all);
}

.card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.card-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: var(--font-medium);
  color: var(--color-charcoal);
  margin-bottom: var(--space-4);
}

.card-body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-charcoal);
}
```

### Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
}

.badge-success {
  background-color: var(--color-sage-light);
  color: var(--color-sage);
}

.badge-error {
  background-color: var(--color-rose-light);
  color: var(--color-rose);
}

.badge-warning {
  background-color: var(--color-amber-light);
  color: var(--color-amber);
}

.badge-neutral {
  background-color: var(--color-sand);
  color: var(--color-charcoal-medium);
}
```

### Progress Indicators

```css
/* Progress Bar */
.progress-bar {
  width: 100%;
  height: 8px;
  background-color: var(--color-linen);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--color-terracotta) 0%,
    var(--color-terracotta-light) 100%
  );
  border-radius: var(--radius-full);
  transition: width var(--duration-slow) var(--ease-out);
}

/* Loading Spinner */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-linen);
  border-top-color: var(--color-terracotta);
  border-radius: var(--radius-full);
  animation: spin var(--duration-slow) linear infinite;
}
```

### Modals

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(45, 45, 45, 0.5);
  backdrop-filter: blur(4px);
  
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  
  z-index: 1000;
}

.modal {
  background-color: white;
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  max-width: 600px;
  width: 100%;
  
  box-shadow: var(--shadow-modal);
  
  animation: modal-appear var(--duration-slow) var(--ease-out);
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### Toast Notifications

```css
.toast {
  position: fixed;
  bottom: var(--space-8);
  right: var(--space-8);
  
  background-color: white;
  border-left: 4px solid var(--color-terracotta);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-6);
  
  box-shadow: var(--shadow-modal);
  z-index: 2000;
  
  animation: toast-slide-in var(--duration-slow) var(--ease-out);
}

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toast-success {
  border-left-color: var(--color-sage);
}

.toast-error {
  border-left-color: var(--color-rose);
}

.toast-warning {
  border-left-color: var(--color-amber);
}
```

### Active Task Banner

A unified banner component for displaying progress of async tasks (transcription, content processing, uploads).

```css
.active-task-banner {
  margin-bottom: var(--space-6);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-linen);
  transition: all 0.2s ease;
}

/* Processing state (blue) */
.active-task-banner[data-status="processing"] {
  border-color: #60a5fa;
  background: linear-gradient(
    135deg,
    rgba(96, 165, 250, 0.08) 0%,
    rgba(96, 165, 250, 0.02) 100%
  );
}

/* Ready/complete state (green) */
.active-task-banner[data-status="ready"] {
  border-color: var(--color-sage);
  background: linear-gradient(
    135deg,
    rgba(139, 157, 124, 0.08) 0%,
    rgba(139, 157, 124, 0.02) 100%
  );
}

/* Error state (red) */
.active-task-banner[data-status="error"] {
  border-color: var(--color-rose);
  background: linear-gradient(
    135deg,
    rgba(201, 124, 124, 0.08) 0%,
    rgba(201, 124, 124, 0.02) 100%
  );
}
```

**Task Types:**
- `AUDIO_UPLOAD`: Uploading audio file
- `AUDIO_TRANSCRIBE`: Transcribing audio
- `FEED_TRANSCRIBE`: Transcribing from RSS feed
- `CONTENT_PROCESS`: Generating content

**Task Statuses:**
- `IDLE`: No active task (banner hidden)
- `UPLOADING`: Upload in progress
- `PROCESSING`: Task running
- `COMPLETE`: Task finished successfully
- `ERROR`: Task failed

**Usage:**
```jsx
import { ActiveTaskBanner, TASK_TYPE, TASK_STATUS } from '@components/shared';

<ActiveTaskBanner
  taskType={TASK_TYPE.FEED_TRANSCRIBE}
  status={TASK_STATUS.PROCESSING}
  title="Transcribing Episode"
  description="Understanding Anxiety in Modern Life"
  progress={45}
  timeRemaining="~2 min remaining"
  onAction={() => navigate(`/episodes/${id}`)}
  actionLabel="View Progress"
  onDismiss={() => setShowBanner(false)}
/>
```

---

## Layout Patterns

### Container

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--space-8);
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 0 var(--space-12);
  }
}
```

### Grid

```css
.grid {
  display: grid;
  gap: var(--space-6);
}

.grid-2 {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.grid-3 {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.grid-sidebar {
  grid-template-columns: 250px 1fr;
  gap: var(--space-8);
}

@media (max-width: 768px) {
  .grid-sidebar {
    grid-template-columns: 1fr;
  }
}
```

---

## Responsive Breakpoints

```css
/* Mobile first approach */
--breakpoint-sm: 640px;   /* Large phones */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Laptops */
--breakpoint-xl: 1280px;  /* Desktops */

@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

---

## Accessibility

### Focus States

All interactive elements must have visible focus states:

```css
*:focus-visible {
  outline: 2px solid var(--color-terracotta);
  outline-offset: 2px;
}
```

### Color Contrast

- Text on cream background: AAA compliant (charcoal)
- Text on white background: AAA compliant (charcoal)
- Buttons: AA compliant minimum
- Links: AA compliant with underline on hover

### Touch Targets

Minimum 44x44px for all interactive elements on mobile.

### Motion

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Dark Mode (Future Enhancement)

Not in MVP, but prepared for:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-cream: #1A1A1A;
    --color-linen: #2D2D2D;
    --color-charcoal: #E8E1D3;
    /* ... adjust other colors */
  }
}
```

---

**This design system creates a warm, professional, and calming environment that reflects the therapeutic nature of the content while maintaining modern UX standards.**
