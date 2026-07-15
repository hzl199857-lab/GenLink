# Home Hero Visual Rhythm Design

## Goal

Restore the original GenLink title area's visual scale and spacing while keeping the new Agent composer and recent-project surface. Remove decorative white outlines from the newly added controls without weakening keyboard focus visibility.

## Scope

Only these files are in scope:

- `src/components/hero/GenLinkHero.tsx`
- `src/components/hero/HeroAgentComposer.tsx`
- `src/components/hero/HeroRecentProjects.tsx`
- `src/components/hero/HeroSurface.test.ts`

Authentication, project loading, Agent submission, canvas launch, and save behavior remain unchanged.

## Title Area

Match the pre-redesign responsive scale:

- Logo width: `280px` by default, `440px` from `sm`, `600px` from `lg`.
- Supporting copy: `16px` by default and `16.8px` from `sm`.
- Logo-to-copy spacing: `24px` by default and `32px` from `sm`.
- Supporting-copy line height: relaxed enough to separate the two lines without changing their wording.

The new composer remains below the title area. Its top spacing may be reduced only when necessary to keep the complete logged-in surface usable at supported viewport heights; the restored title dimensions take priority.

## Border Treatment

Remove decorative white borders from:

- Agent composer outer surface.
- Model selector.
- Uploaded-image previews.
- Recent-project cards and the new-project card.
- Thumbnail/content separators inside project cards.

Use existing dark surface contrast, shadows, and hover translation/background changes to preserve component boundaries. Keep `focus-visible` outlines because they appear only during keyboard navigation and communicate interaction state rather than decoration.

## Responsive Behavior

- Desktop reference viewport: `1440 x 1000`.
- Mobile reference viewport: `390 x 844`.
- No horizontal page overflow.
- Composer controls must not overlap or resize unexpectedly.
- The restored title must fit without clipping on mobile.
- Logged-in recent projects may retain horizontal card scrolling on narrow screens.

## Verification

1. Add source-contract assertions for the restored title tokens and removed decorative borders.
2. Run `node --test src/components/hero/HeroSurface.test.ts` and confirm the new assertions fail before implementation.
3. Apply the minimal Tailwind class changes and rerun the focused test.
4. Run `npx tsc --noEmit --incremental false` and `npm run lint`.
5. Capture and inspect desktop and mobile screenshots from the local development server.

