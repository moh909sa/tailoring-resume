# About this app

This file describes this app's stack, structure, and conventions. **Keep it updated and short**: when the app gains a backend, new conventions, or significant structure, edit this file (and the README) in place so future sessions inherit that knowledge. This file is loaded into every session, so it describes the current state only. Never add dated or per-task entries, change logs, or test results, even if earlier ones exist. Put notable decisions in `docs/HISTORY.md` as one line each, and keep this file under about 200 lines.

## Stack

- Expo cross-platform app (iOS / Android / Web), TypeScript (strict), Expo Router (file-based routing under `app/`)
- NativeWind (Tailwind for RN) for styling
- Yarn Berry (v4.x) — check `.yarnrc.yml` for the linker; with Plug'n'Play there is no traditional `node_modules`. Patching dependencies is a last resort; use `yarn patch`, never hand-edit.
- React Query available for server state when a backend is wired
- Path aliases are defined in `tsconfig.json` `paths` — use them instead of long relative imports.

## Theming

Keep colors and typography centralized in the app's existing theme setup (Tailwind config, theme files, or CSS variables) and use them through NativeWind classes — never hardcode per screen. When changing colors/typography, update the central definitions. Support both light and dark with readable contrast if the app supports both.

## Conventions

- **Reuse first:** use the app's existing component, icon, and styling libraries and patterns before adding new ones. Check `package.json` and existing components before introducing a dependency.
- **Icons:** use the app's existing icon approach. If icons need NativeWind classes, make sure they go through a wrapper or interop that applies them.
- **Navigation:** set an explicit human-friendly `title` for every screen header — never let route names like `(tabs)` or `products/[id]` appear in the UI. Keep `app/index.tsx` for redirects, not feature UI; use `_layout.tsx` files for stacks/tabs.
- **API routes:** server-only logic can live in Expo Router API routes (`+api.ts` files under `app/`). They require `web.output: "server"` in the app config and run in the preview; secrets they read use unprefixed environment variables, never `EXPO_PUBLIC_`.
- **Fonts:** load through the `expo-font` config plugin (declared in the app config) or `useFonts` in the root layout — follow whichever the app already uses.
- **Screens:** wrap in SafeAreaView (react-native-safe-area-context) and handle scrolling/gestures correctly. Keep bottom tab bars compact — pad content inside screens, not via `tabBarStyle`.
- **Components:** keep components small and focused, follow the app's existing folder structure, and reuse before creating.
- **Performance:** `FlatList`/`SectionList` for long lists — never `ScrollView` + `.map()` for large collections.

## Critical files

- `app/_layout.tsx` — root layout and app-wide providers
- `tailwind.config.js` and `global.css` — NativeWind config and global styles
- `app.config.*` — Expo app config

## Draftbit starter structure (if present)

Apps created from the Draftbit starter ship with the pieces below. Follow them where they exist; don't add them to apps that don't have them.

- **Theming:** `theming/ThemeProvider.tsx` injects theme objects (colors + typography) as CSS variables via NativeWind's `vars()`; typography is flattened (`h1.fontSize` → `--h1-fontSize`). Theme shape in `theming/Theme.ts`, concrete themes in `theming/themes/light.ts` and `dark.ts`, mapped to classes (`text-foreground`, `bg-background`, `text-h1`, `border-border`, …) in `tailwind.config.js`. `lib/useColorScheme.tsx` syncs the system preference. Use `useTheme()` only for raw values; change colors/typography in the theme files.
- **Components:** React Native Reusables (shadcn-style, `@rn-primitives/*`) in `components/ui/`, layout pieces in `components/layout/`, `cn` helper in `lib/utils.ts`. Build higher-level components on these primitives. Without `components/ui/` and `@rn-primitives/*` in `package.json`, compose React Native primitives with NativeWind instead and don't pull `@rn-primitives/*` in unless asked.
- **Icons:** `lib/icons/LucideIcon` wraps Lucide so NativeWind classes apply — `<LucideIcon name="Home" className="h-6 w-6 text-foreground" />`. Don't import from `lucide-react-native` directly, and validate `name` against the wrapper's registry.
- **Portals:** web uses `WebPortalContext`, native uses `PortalHost` from `@rn-primitives/portal`, both set up in `app/_layout.tsx`; the `components/ui/` primitives rely on them.
- **Alias:** `~/*` maps to the project root, e.g. `import { useTheme } from '~/theming/ThemeProvider';`.

## Current state

- `app/index.tsx` redirects to Home under `app/(tabs)/`. Bottom tabs are Home, Tailor, and Library. Library has My CVs and Tailored CVs screens with a shared section switcher; Home cards link directly to each screen. The legacy `app/my-cv.tsx` URL redirects to My CVs.
- `lib/supabase.ts` connects to existing project `suvcisvnbwplbemuxspu` with a publishable key only. `lib/auth/AuthProvider.tsx` restores sessions and manages native foreground token refresh. Native sessions persist through AsyncStorage; web sessions use Supabase's browser storage.
- My CVs reuses the existing email/password sign-in and account creation form in an account sheet. Existing Supabase settings require email confirmation.
- `lib/cv/api.ts` uses authenticated Railway mobile endpoints: multipart `POST /api/v1/mobile/resumes/upload`, `GET /api/v1/mobile/resumes`, and `DELETE /api/v1/mobile/resumes/{id}`. Tokens come from the current Supabase session. No direct Storage access or database writes.
- `lib/cv/file.native.ts` builds multipart files from native URIs; `file.web.ts` uses browser File objects. Expo DocumentPicker accepts PDF/DOCX, with client validation of the 4 MiB limit.
- `lib/cv/useMyCv.ts` refreshes on screen focus and after successful and failed upload requests, polls pending processing, and retains confirmed originals if refresh fails. Failed and recovery-required files stay visible. Every My CVs card has a delete menu with confirmation, regardless of processing status; HTTP 204 triggers list refresh and confirmed deletions stay removed if refresh fails.
- Tailor CV uses Ready originals and pasted job descriptions (50–12,000 characters). `POST /api/v1/mobile/tailor/preview` sends only `resume_id` and `job_description`; existing Supabase bearer auth and server defaults apply. Job URLs remain unsupported for tailoring.
- `lib/tailoring/TailoringProvider.tsx` keeps owner-scoped draft state, blocks concurrent operations, and clears/aborts on account changes. AsyncStorage retains only the draft ID, last preview ID, form inputs, step, and explicit keyword choices; resume content reloads through authenticated `GET /api/v1/mobile/tailor/{id}/review`. Tailor CV offers a link to resume an unfinished review. Processing keeps its existing real elapsed timer and unsimulated stages.
- Success opens the three-step review: Optimize Keywords, Review Changes, Confirm & Save. Review data comes from the backend `review` object. Supported keywords send `attested:false`; absent skills require an explicit “I have this” choice and `attested:true`. Keyword application uses the latest `preview.preview_id` and replaces the full review; scores, history, placements, counts, comparisons, and warnings are never simulated.
- `POST /api/v1/mobile/tailor/{id}/keywords` sends `expected_preview_id` and selected keywords. Conflicts and ambiguous failures reload the server draft without retrying mutations. Expired drafts require explicit regeneration. Confirmation first checks the latest review, requires re-review if its preview ID changed, then calls `POST /api/v1/mobile/tailor/{id}/confirm` with no body only after “Confirm & Save.” Saved acknowledgement ends the flow; Tailored CVs library loading, editing, and export remain unconnected.
- `components/layout/` provides iPhone-first safe-area shells and headers; `components/library/` provides Library section navigation. Shared theme and icon wrappers cover all screens.
- Public configuration: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_RESUME_API_URL`. Never put server secrets in these variables.
- Railway's `CORS_ORIGINS` must allow the exact web preview/published origins for browser uploads; native iOS does not require CORS.
