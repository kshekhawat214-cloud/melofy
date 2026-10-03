ROLE
You are a senior full-stack engineer. Build a complete, production-quality music streaming web app that closely matches the layout, interaction patterns, and dark visual style of Spotify's desktop web player. Use the working name "Tunely" (placeholder; make it a single config constant). Do NOT use Spotify's name, logo, or any Spotify-owned assets. Draw all icons yourself as inline SVGs or use lucide-react / react-icons.

NO AUTHENTICATION (IMPORTANT)
- No login, sign up, forgot password, OAuth, JWT, sessions, or password hashing. Do not build any auth pages or endpoints.
- Seed one default user (id=1, display_name "Guest", default avatar). A backend middleware attaches this user to every request via a single function getCurrentUser(req). All user-specific data (likes, playlists, library, history, queue, settings) belongs to this user.
- The app opens straight to the Home page. The avatar dropdown in the top bar shows "Guest" with: Profile, Settings only (no Log out).
- Keep all user-owned tables keyed by user_id so real auth can be dropped in later by replacing getCurrentUser().

TECH STACK
Frontend: React 18 + TypeScript + Vite, Tailwind CSS, Zustand (player/UI state), TanStack Query (server state), React Router v6, Framer Motion (subtle transitions), react-virtuoso (virtualized lists), color-thief (dynamic header gradients from cover art).
Backend: Node.js + Express + TypeScript, PostgreSQL + Prisma, Redis (caching, rate limiting), Zod validation, multer for uploads, S3-compatible storage (MinIO locally) for audio and images, ffmpeg for transcoding to HLS/AAC.
Tooling: Docker Compose (api, postgres, redis, minio), ESLint, Prettier, Vitest, Playwright smoke tests, .env.example, seed script.

MUSIC DATA SOURCE
Seed catalog from Jamendo API (free, CC-licensed full tracks) and/or Audius API. Also support uploads (mp3/flac/wav -> ffmpeg -> HLS). Streaming endpoint must support HTTP Range requests. Never hardcode copyrighted audio.

DESIGN TOKENS
Colors:
- bg-base #121212 (main panels), bg-black #000000 (page background/gutters)
- surface #181818 (cards), surface-hover #282828, surface-elevated #1F1F1F
- accent green #1DB954 (hover/bright #1ED760); swap for your own accent if preferred
- text-primary #FFFFFF, text-secondary #B3B3B3, text-muted #6A6A6A
- divider rgba(255,255,255,0.1), error #E91429
Typography: Spotify uses a proprietary font (Circular). Substitute "Figtree" or "Inter". Weights 400/700/900. Sizes: page title 96/72/48px responsive (weight 900, tight letter-spacing), section heading 24px bold, body 14px, secondary 12-14px, uppercase labels 11-12px with letter-spacing.
Radius: cards 8px, buttons fully rounded, track cover 4px, card cover 8px, artist images 50%.
Spacing: 8px base grid. 8px gap between panes, panes have 8px rounded corners on black background.
Shadows: cover art 0 4px 60px rgba(0,0,0,.5). Card hover background -> #282828.
Scrollbars: thin, hidden until hover, thumb rgba(255,255,255,.3).

LAYOUT (desktop >= 1024px)
CSS grid, full viewport height, 8px padding around everything:
- Left sidebar: 280px default, drag-resizable (min 72px collapsed icon-only, max ~420px). Two stacked rounded panels:
  1. Top nav: Home, Search (active = white, inactive = #B3B3B3).
  2. "Your Library": header with icon + title, "+" menu (Create playlist / Create folder), expand/collapse arrow. Filter chips (Playlists, Artists, Albums). Library search icon, sort dropdown (Recents, Recently Added, Alphabetical, Creator), grid/list toggle. Scrollable items: 48px cover, bold title, secondary subtitle "Playlist - Guest", green speaker icon + green title when playing. Liked Songs pinned first with a purple-to-blue gradient heart tile. Row hover bg #1A1A1A with play overlay on cover.
- Center main view: flex-1 rounded panel #121212 with its own scroll. Sticky top bar: back/forward circular chevron buttons (black 70% opacity, 32px), search pill on the Search page, avatar button on the right. Top bar turns opaque with the page's dominant color after ~200px scroll.
- Right sidebar (toggleable, 280-420px, resizable): Now Playing view (large cover, title, clickable artist, "About the artist" card, credits, "Next in queue"). Switchable to Queue view.
- Bottom player bar: 72-90px, black, 3 columns (30/40/30):
  - Left: 56px cover, title (hover underline), artist (secondary, hover underline), heart (green when liked), add-to-playlist icon.
  - Center: shuffle, previous, 32px white circular play/pause (scale 1.06 on hover), next, repeat (off/all/one with green dot). Below: elapsed time, 4px progress slider (grows on hover, white handle, turns green on hover), total duration.
  - Right: lyrics icon, queue icon, volume icon + 93px volume slider, fullscreen icon. Active toggles are green.
Mobile (< 768px): single column, bottom tab bar (Home, Search, Your Library), mini-player above it that expands into a full-screen now-playing sheet. Tablet: collapsed sidebar.

PAGES & COMPONENTS
1. Home: time-based greeting, 2x4 grid of 8 quick-access tiles (hover shows green play button, lightens, and tints the header gradient with that tile's dominant color). Shelves: "Made for you", "Recently played", "Popular artists", "New releases", "Charts", "Genres & moods", each with "Show all". Card hover: bg #1A1A1A -> #282828, green circular play button slides up from bottom-right of the cover (opacity 0->1, translateY 8px->0).
2. Search: empty state "Browse all" grid of colored genre tiles (saturated colors, rotated art bottom-right, bold title top-left). On typing (debounced 300ms): top result card, songs, artists, albums, playlists; filter chips (All, Songs, Artists, Albums, Playlists). Recent searches list.
3. Playlist page: gradient header from cover's dominant color fading into #121212; 232px cover with shadow, "Playlist" label, huge auto-shrinking title, owner + song count + total duration. Action row: 56px green play circle, shuffle, download icon (visual only), follow/heart, "..." menu. Sticky table header (#, Title, Album, Date added, duration clock icon) that becomes opaque when stuck. Track rows 56px, hover bg rgba(255,255,255,.1), index becomes play icon on hover, green animated equalizer on current track, heart and "..." appear on hover, columns hide on narrow widths. Right-click context menu (Add to queue, Go to artist, Go to album, Add to playlist >, Remove from this playlist, Copy link). Drag-and-drop reorder.
4. Album page: like playlist plus release year, disc grouping, copyright footer, "More by artist" shelf.
5. Artist page: darkened banner hero with gradient, verified badge, monthly listeners, Play / Follow / "..." buttons, "Popular" top 5 (with "See more"), Discography tabs (Popular releases, Albums, Singles & EPs), "Fans also like", "Artist pick", About.
6. Liked Songs: purple gradient header, same table layout.
7. Library views: grid and list, compact/default density.
8. Queue page: "Now playing" + "Next from: <source>", clear queue, drag to reorder.
9. Profile page (Guest): avatar, name, public playlists, top artists/tracks this month.
10. Settings: display name/avatar edit, audio quality, autoplay, explicit filter, crossfade, accent color.
11. Lyrics view: full-screen synced lyrics from LRC data, highlight current line, auto-scroll. Use only user-supplied or licensed lyrics.
12. Create/Edit playlist modal: cover upload, name, description, public/private toggle.
13. Toasts ("Added to Liked Songs"), skeleton loaders on every list, error and 404 pages, empty states.

PLAYER ENGINE (critical)
- HTML5 Audio + hls.js, global singleton in a Zustand store: currentTrack, queue, queueIndex, isPlaying, progress, duration, volume, muted, shuffle, repeatMode, playbackSource.
- Preload next track at ~80% progress; crossfade (0-12 s) via two audio elements and gain nodes.
- Shuffle with Fisher-Yates, preserving original order for un-shuffle. Repeat: off / context / track. Previous: restart if >3 s elapsed, else previous track.
- Media Session API, keyboard shortcuts: Space play/pause, Shift+Left/Right prev/next, Ctrl+Up/Down volume, M mute, S shuffle, R repeat, / focus search.
- Persist volume, queue, last position (localStorage + server); resume paused on reload.
- Log a "play" after 30 s of listening.
- Dominant-color extraction from cover art for header tints.

DATABASE SCHEMA (Prisma / PostgreSQL)
users(id, display_name, avatar_url, created_at) -- seeded with the single Guest user
artists(id, name, bio, image_url, verified, monthly_listeners_cache)
albums(id, artist_id, title, cover_url, release_date, type[album|single|ep], label)
tracks(id, album_id, title, duration_ms, track_number, disc_number, explicit, audio_url/hls_manifest, lyrics_lrc?, play_count, popularity)
track_artists(track_id, artist_id, role)
genres(id, name, color), track_genres
playlists(id, owner_id, name, description, cover_url, is_public, created_at, updated_at)
playlist_tracks(playlist_id, track_id, position, added_at)
liked_tracks(user_id, track_id, created_at)
followed_artists(user_id, artist_id), followed_playlists(user_id, playlist_id), saved_albums(user_id, album_id)
play_history(id, user_id, track_id, played_at, context_type, context_id, ms_played)
search_history(user_id, query, created_at)
user_settings(user_id, audio_quality, autoplay, explicit_filter, crossfade_ms, accent_color)
Indexes on foreign keys, pg_trgm trigram index on tracks.title / artists.name / albums.title, unique (playlist_id, position).

REST API (prefix /api/v1, JSON, Zod-validated, paginated)
No auth routes. All "me" routes use getCurrentUser().
Me: GET/PATCH /me, GET /me/playlists, /me/liked, /me/library, /me/top/{tracks|artists}, /me/recently-played, GET/PATCH /me/settings
Catalog: GET /tracks/:id, /albums/:id, /albums/:id/tracks, /artists/:id, /artists/:id/top-tracks, /artists/:id/albums, /artists/:id/related, /genres, /genres/:id/playlists
Browse: GET /browse/home, /browse/new-releases, /browse/charts, /browse/made-for-you
Search: GET /search?q=&type=track,artist,album,playlist&limit= (ranking: exact > prefix > trigram similarity > popularity)
Playlists: POST /playlists, GET/PATCH/DELETE /playlists/:id, POST/DELETE /playlists/:id/tracks, PUT /playlists/:id/tracks/reorder, PUT /playlists/:id/cover, PUT/DELETE /playlists/:id/follow
Library: PUT/DELETE /me/liked/:trackId, /me/albums/:id, /me/following/artists/:id
Player: GET /stream/:trackId (Range support), POST /player/played, GET/PUT /player/queue
Upload: POST /uploads/track, /uploads/image (multipart, size/type checks, ffmpeg job via BullMQ)
Recommendations: GET /recommendations?seed_tracks= (genre/artist similarity + co-listen counts)
Standards: error format {error:{code,message}}, Redis rate limiting (per IP), CORS, helmet, pino logging, OpenAPI docs at /docs, Redis caching for browse/home and artist pages.

INTERACTION & POLISH
- Dark theme only (optional accent color picker).
- Hover states everywhere; focus-visible outlines, WCAG AA contrast, aria-labels, keyboard-navigable lists, role="slider" for sliders.
- 150-300ms ease transitions, no layout shift, shimmer skeletons.
- Virtualize lists > 100 rows.
- Lazy-load images with blurred placeholder and fallback art.
- Ellipsis truncation for long text.
- Resizable panes persisted to localStorage.
- Document title shows "Track - Artist" while playing.
- PWA manifest + service worker (offline shell).

PROJECT STRUCTURE
/apps/web (React), /apps/api (Express), /packages/shared (types, zod schemas), docker-compose.yml, README with setup, env vars, seed instructions.

DELIVERY PLAN (commit after each phase; app must run)
Phase 1: monorepo scaffold, Docker, DB schema, seed Guest user + Jamendo catalog.
Phase 2: static layout (3 panes + player bar) with design tokens.
Phase 3: catalog pages (home, album, artist, playlist) with real API data.
Phase 4: player engine + queue + media session + shortcuts.
Phase 5: library, likes, playlist CRUD, drag-and-drop, context menus.
Phase 6: search.
Phase 7: uploads/transcoding, lyrics, recommendations.
Phase 8: responsive/mobile, accessibility, PWA, tests, performance pass.
After each phase, list what works and what remains. Ask me before any decision that changes scope.
RESPONSIVE + ANDROID REQUIREMENTS (add to everything above)

One codebase, three targets: desktop browser, Android browser (PWA), and Android APK via Capacitor. Do not build a separate native app.

BREAKPOINTS
- Mobile < 768px: single column, bottom tab bar (Home, Search, Your Library), mini-player docked above the tab bar. No left or right sidebars.
- Tablet 768-1023px: collapsed icon-only left sidebar, no right sidebar by default.
- Desktop >= 1024px: full three-pane layout as specified.
Use Tailwind responsive utilities plus a useBreakpoint() hook. Layout switches must not remount the player or interrupt playback.

MOBILE UI
- Mini-player: 56px, cover + title/artist + heart + play/pause, thin progress line along the bottom edge. Tap opens the full-screen Now Playing sheet with swipe-down to close.
- Full-screen Now Playing: large cover (tinted background from dominant color), title/artist, scrubber with elapsed and total time, shuffle/prev/play/next/repeat, and buttons for queue, lyrics and add to playlist.
- Library on mobile: its own page with filter chips, sort and grid/list toggle.
- Track rows: 3-dot menu opens a bottom sheet (not a right-click menu). Long-press also opens it. Swipe a row left to add to queue.
- Track tables show only cover, title/artist and a menu button; hide the Album, Date added and Duration columns.
- Horizontal shelves scroll with touch and snap.
- Touch targets at least 44x44px. No hover-dependent features: play buttons are always visible on mobile cards.
- Pull-to-refresh on Home. Android back button/gesture must close sheets and modals first, then navigate back.
- Safe-area insets (env(safe-area-inset-*)), viewport meta with viewport-fit=cover, use 100dvh not 100vh, theme-color meta #000000.
- Respect prefers-reduced-motion.

PWA (INSTALLABLE ON ANDROID)
- Web app manifest: name, short_name, icons (192, 512, maskable), display: standalone, orientation: any, background and theme color #000000, start_url "/".
- Service worker (vite-plugin-pwa): precache the app shell, runtime-cache images and API GET responses (stale-while-revalidate), never cache audio streams.
- Media Session API: title, artist, album, artwork (multiple sizes), and handlers for play, pause, previoustrack, nexttrack, seekto, seekbackward, seekforward, so lock-screen and notification controls work.
- Keep playback alive with the screen off: use a single persistent HTMLAudioElement, resume AudioContext on user gesture, and handle audio focus and interruptions (calls, other apps) by pausing and resuming.
- Show a custom "Install app" prompt using the beforeinstallprompt event.

CAPACITOR ANDROID APP (phase after PWA works)
- Add Capacitor to /apps/web: @capacitor/core, @capacitor/cli, @capacitor/android. appId "com.yourname.tunely".
- Use a native media-session/foreground-service plugin so playback continues in the background with a persistent notification and lock-screen controls. Before choosing a plugin, compare the currently maintained options and confirm that the one you choose supports the current Capacitor major version.
- Add @capacitor/status-bar (dark style, black background), @capacitor/splash-screen, @capacitor/app (handle the hardware back button), @capacitor/network (offline banner), @capacitor/haptics (light feedback on like).
- API base URL must come from an environment variable (VITE_API_URL). On Android it must be a public HTTPS URL, not localhost. Configure CORS on the backend to allow the Capacitor origins (https://localhost and capacitor://localhost) and the web domain.
- Provide scripts: "build:web", "cap:sync", "cap:open:android", and README steps to build a debug APK and a signed release APK/AAB in Android Studio.
- Use platform detection (Capacitor.isNativePlatform()) so web-only code, such as the install prompt, doesn't run in the APK.

PERFORMANCE ON MID-RANGE ANDROID
- Route-level code splitting and lazy-loaded images with fixed aspect ratios.
- Virtualize all long lists. Serve cover art in multiple sizes via srcset (64, 128, 300, 640px).
- Avoid heavy blur/backdrop-filter and large box-shadows on scrolling lists.
- Target Lighthouse mobile performance >= 85, PWA installable check passing.

TESTING
- Playwright viewports for 390x844 (mobile), 820x1180 (tablet), and 1440x900 (desktop). Test that playback persists across a resize, and that the mobile tab bar and bottom-sheet menu work.
- Manually test on a real Android device: background playback, lock-screen controls, back button, install flow.

ADD TO DELIVERY PLAN
Phase 8 becomes: responsive/mobile UI + PWA.
Phase 9 (new): Capacitor Android wrapper, background playback plugin, APK build.