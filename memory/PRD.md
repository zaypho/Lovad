# PRD — LinguaConnect (HelloTalk Clone)

## Original Problem Statement
"Can you clone hellotalk app" — A language exchange application similar to HelloTalk featuring user profiles, native/target language matching, and messaging capabilities. User communicates in **Bengali** — always respond in Bengali.

## User Choices (confirmed)
- Full HelloTalk feature scope ("All")
- JWT-based email/password authentication
- AI-powered translation via **GPT-5.2** (Emergent Universal Key)
- **WebSocket** real-time chat
- HelloTalk-like design (light sky blue) — design system in `/app/design_guidelines.json`
- Streak = CONSECUTIVE days (user picked option A)

## Tech Stack
- Frontend: Expo (React Native) + Expo Router, Figtree/Nunito fonts, light sky-blue theme
- Backend: FastAPI + Motor (MongoDB), JWT (PyJWT + passlib bcrypt), WebSocket at `/api/ws`
- AI: emergentintegrations LlmChat → openai/gpt-5.2 (EMERGENT_LLM_KEY in backend/.env)

## Architecture
### Backend (`/app/backend/`)
- `server.py` — app, CORS, WS endpoint `/api/ws?token=JWT`, router registration
- `db.py` — Mongo collections: users, conversations, messages, moments, comments, rooms, room_messages, audio_files, media_files, profile_visits (+indexes)
- `auth_utils.py` — bcrypt, JWT, get_current_user
- `models.py` — Pydantic models + user serializers (`_learning_list` compat helper)
- `routes/` — auth.py (streak logic `touch_streak`), users.py (partners matching, visitors, avatar upload, country/age immutability), chats.py (text/voice/image messages), moments.py (posts, likes, nested reply comments), rooms.py (voice rooms + host moderation), ai.py, audio.py, media.py
- `seed.py` — idempotent: 9 demo users (multi-language lists, age, interests) + 6 moments (password Demo1234!)
- `tests/` — test_api.py, test_new_features.py, test_iteration3_features.py, test_websocket.py (WS tests need pytest-asyncio — missing in env)

### Key API Endpoints (all `/api` prefixed)
- POST /auth/register, /auth/login (updates streak); GET /auth/me (updates streak)
- PUT /users/me (country & age SET-ONCE immutable); POST /users/me/avatar {image_base64,mime} → avatar_url=/api/media/{id}
- GET /users/me/visitors → {count, visitors[+visited_at,is_online]}
- GET /users/partners?language= (best-match uses learning_languages/teach_languages lists); GET /users/{id} (records profile visit, returns profile_views)
- POST/GET /chats...; POST /chats/{id}/voice; POST /chats/{id}/image; GET /media/{id}; GET /audio/{id}
- Moments: GET/POST /moments, /like, POST /moments/{id}/comments {text, reply_to?} → reply_to_author
- Rooms: CRUD + /join (banned→403), /leave, /end, /hand, /hand/dismiss {user_id} (host), /mic, /role, /kick {user_id} (host, bans), /messages
- WS relay: call_offer/answer/ice/end/decline, rtc_*; events: new_message, room_update, room_message, room_ended, room_kicked

## DB Schema (uuid string _id)
- users: email, password_hash, name, bio, country (set-once), age (set-once), avatar_url, native_language, teach_languages[≤2], learning_languages[≤3], learning_language (compat=first learning), proficiency, interests[≤20], streak_count, last_active_date, created_at
- profile_visits: visitor_id+visited_user_id (unique), visited_at (upsert)
- messages: type text|voice|image, audio_id/image_id; media_files & audio_files: {_id, data(bytes), mime}
- rooms: host_id, members{uid:{role,mic_on,hand_raised}}, banned[], is_live
- comments: moment_id, user_id, text, reply_to?, reply_to_author?

### Frontend (`/app/frontend/`)
- Tab order: **Chats, Connect, Moments, Voice, Me**
- `app/onboarding.tsx` — 6 steps: native lang → teach (≤2, skippable) → learning (1-3) → country (one-time) → age (13-120, one-time) → interests (1-20)
- `app/(tabs)/connect.tsx` — filters: Best Match + user's ≤3 learning languages (NO Everyone)
- `app/(tabs)/profile.tsx` — HelloTalk-style: avatar photo upload (camera badge → image picker → /users/me/avatar), stats bar (🔥streak | 👁profile views→/visitors | 📅days member), collapsible language edit sections (LayoutAnimation), interests chips, locked country/age (🔒), segmented light/dark toggle (mode-light-btn/mode-dark-btn)
- `app/visitors.tsx` — profile visitors list (time-ago, tap→profile)
- `app/user/[id].tsx` — partner profile: stats row, interests chips, age, records visit
- `app/chat/[id].tsx` — text/voice/image messages, plus-icon media button (chat-media-btn), per-bubble AI translate; grammar-correction UI REMOVED (backend /ai/correct still exists)
- `app/moment/[id].tsx` — nested comment replies (Reply btn per comment, reply banner, "Replying to X" tag, indented)
- `app/room/[id].tsx` — host card (room-host-card), Stage requests panel (hand-accept-{id}/hand-dismiss-{id}), host controls per member (room-role-btn/room-kick-btn), flags on all avatars
- `src/components/Avatar.tsx` — flag badge bottom-LEFT, blue online dot (#0EA5E9) bottom-RIGHT; resolves relative avatar urls via assetUrl()
- `src/components/LanguagePair.tsx` — short codes (EN⇄ES) everywhere; compact = smaller single-line chips
- `src/constants/` — languages.ts, countries.ts (COUNTRIES list + countryToCode), interests.ts (32 options, MAX 20)

## What's Implemented (June 2026)
✅ MVP: auth, onboarding, partner discovery, WS chat, AI translate, moments, profiles, seed
✅ Voice messages, voice rooms (hand raise/roles), WebRTC voice calls (WEB ONLY — native needs dev build)
✅ Streak (consecutive days) + profile visitors + stats bar (iteration 2 — tested)
✅ Image messages in chat (media collection + /api/media)
✅ Multi-language (native+2 teach / 3 learning), Connect filters, tab reorder
✅ Nested moment replies, avatar flags+online dots everywhere, profile photo upload, collapsible language sections, interests, set-once country/age, dark-mode segmented toggle, voice room host moderation (kick/ban/hand accept-dismiss)
✅ Tested: iteration_1/2/3.json all pass (backend 15/15 + full frontend E2E)

## Backlog / Known Issues
- LOW: auth-hydration race on hard reload deep-links (first API call 401 before token restore) — carry-over
- LOW: RN deprecation `props.pointerEvents` warnings
- env: pytest-asyncio missing → 2 WS tests skipped
- P2: typing indicators, inline message corrections, followers/hashtags
- Refactor: profile.tsx ~950 lines — split edit sections into components

## Notes for Future Agents
- Fork lost .env files once — recreated: backend/.env (MONGO_URL, DB_NAME=linguaconnect, JWT_SECRET, CORS_ORIGINS, EMERGENT_LLM_KEY), frontend/.env (EXPO_PUBLIC_BACKEND_URL + EXPO_PACKAGER_* = preview URL)
- Test credentials: /app/memory/test_credentials.md (demo@demo.com / Demo1234!)
- User writes in Bengali — reply in Bengali
- app.json has photo/mic permissions (iOS infoPlist + Android permissions)

## Iterations 5–7 (this session — all tested & passing)
✅ Market: standalone /market screen (removed from tab bar), opened via Marketplace card on Profile; VIP 7d/1m/lifetime, badges, frames (incl. ANIMATED frames: frame_rainbow, frame_neon w/ color-cycling reanimated rings); DEMO coin top-up (POST /api/market/topup, amounts 100/500/1000/2000)
✅ Moment detail: collapsing header (scroll → author avatar+name in topbar); likers row (overlapped avatars+flags) + "Liked by" sheet (GET /api/moments/{id}/likes); translate buttons on posts (feed+detail); VIP badge next to names, languages on 2nd line
✅ Translation: FREE Google endpoint (translate.googleapis.com) w/ LLM fallback; free users 3/day (configurable), VIP unlimited; target = user's native_language code
✅ VIP perks: visitors list VIP-only (free = count + lock UI), room hosting free 1/day, new-chat caps free 10/day / VIP 25/day (mutual follows exempt)
✅ Search: /search screen (name + native/learning/gender/online filters via extended GET /users/partners); Connect search bar collapses to topbar icon on scroll
✅ Chat 3-dot menu: view profile, mute (skips unread inc), hide their moments (feed filter), clear history (DELETE /chats/{id}/messages), block/unblock (403 enforcement)
✅ Voice rooms: animated SpeakingBars equalizer + pulsing green ring (Avatar isSpeaking); Avatar `frame` prop (was frameColor) renders static/animated rings
✅ Redesigned 1:1 call UI: full-screen gradient, PulseRing ripples, labeled accept/decline/mute/end, timer pill
✅ ADMIN DASHBOARD: secret web URL /admin-x7k2p9, admin@lingua.app/Admin1234! (seeded idempotently at startup); stats, user mgmt (ban→login 403, restrict→post/send 403, VIP grant/revoke, set coins, delete), market price overrides+disable (market_config col), moments moderation, app limits config (app_config col, applied live)
✅ Keyboard UX: react-native-keyboard-controller 1.18.5, KeyboardProvider at root, KAV swapped in chat/moment/room ("translate-with-padding") + auth/onboarding/moments-composer/voice
✅ Tests: iteration 5/6 reports pass; iteration 7 pytest 20/20 (tests/test_iteration7_features.py)

## Iteration 8 (tested & passing — iteration_8.json)
✅ Chats list: VIP badge + active badge emoji next to names, frame rings; live voice-room status (purple mic badge on avatar + "🎙️ In voice room · name" line, GET /chats attaches partner.in_voice_room from live rooms members dict)
✅ /search revamped: language filters removed → funnel filter icon toggles panel (age presets 18-25/26-35/36+, location country/city input, gender, online, reset + count badge); backend /users/partners min_age/max_age/location params
✅ Profile "About" (About me/Country/Age/Gender/Interests) = one collapsible card (collapse-about), auto-expands in edit mode

## Iterations 9-11 (tested & passing — iteration_9/10/11.json)
✅ Connect header bug fixed (search icon top-right on scroll; header row + missing styles)
✅ Unique usernames: auto-generated at register, startup backfill, PUT /users/me/username (once/30d, 429/409/400), @username pill on own profile w/ edit modal + shown on user profiles; unique sparse index
✅ Profile redesign: name 24, username pill, gradient gold VIP banner (LinearGradient), radius.lg cards, bigger stats
✅ 1:1 calls production-grade: shared /src/utils/webrtc.ts (web + react-native-webrtc native builds, Expo Go fallback), ICE buffering, 45s ring timeout, call_unavailable (offline callee), cross-platform notify() (RN-web Alert is no-op!), full E2E pass (ring/accept/timer/end/decline/offline/mic-denied)
✅ Voice room mesh on same WebRTC stack: per-peer ICE buffering, auto re-offer on 'failed', native-capable, E2E pass (host+listener, mic toggle, hand raise, leave/end)
⚠️ ws@8 pinned as devDependency (react-native-webrtc install caused ws@7 hoist → expo 'WebSocketServer is not a constructor' crash)
✅ Admin URL for user: /admin-x7k2p9 (admin@lingua.app / Admin1234!)

## Iteration 12 (this session — manually e2e verified via playwright)
✅ AI Grammar Correction in chat: pencil icon on every text bubble (mine+theirs) → /ai/correct → green "Corrected" box (corrected text + italic explanation, "✓ No mistakes found" if identical); sparkles AI-fix button next to send corrects the draft in-place + draft-hint-bar shows explanation 6s
✅ Voice message bug fix: startRecording had silent failures (RN-web Alert no-op + unhandled errors). Now: getRecordingPermissions→request flow, canAskAgain→Open Settings redirect, try/catch with cross-platform notify(); all chat error alerts (voice/photo/translate/correct) use notify()
✅ Incoming call ringtone + vibration: /app/frontend/assets/sounds/ringtone.wav (generated double-beep), expo-audio useAudioPlayer looped + Vibration.vibrate([600,1000],true) while call.status==="incoming" in CallContext
✅ Connect page language chips shrunk (compact: flag 9, font 9, padding 4/1, gap 2) in LanguagePair.tsx
Note: Daily streak (backend touch_streak + profile/user page display) already existed from iteration 2.

## Deployment readiness fixes (this session — deployment_agent PASS)
✅ .gitignore: removed .env/.env.*/*.env blocks (env files must be tracked for deploys)
✅ frontend/.env: added EXPO_TUNNEL_SUBDOMAIN=social-profile-37, EXPO_USE_FAST_RESOLVER="1"
✅ Supervisor expo command now `expo start --tunnel --port 3000` + @expo/ngrok devDep installed
⚠️ ngrok install re-hoisted event-target-shim@6 to root → Metro "Missing ./index specifier" (react-native-webrtc imports event-target-shim/index). Fixed via patch-package: patches/event-target-shim+6.0.2.patch (adds "./index" export) + postinstall script. DO NOT REMOVE the patch or postinstall.
✅ N+1 queries batched ($in + map): moments.py (list authors, comment authors), chats.py (list partners; conversation_public/moment_public accept optional prefetched doc), rooms.py (list hosts)
✅ db.py ensure_indexes: per-index try/except (idempotent, survives transient Atlas handshake EOF — the original MongoDataMigrate failure was a retryable Atlas connection blip during index restore)

## BuildImage deploy failure fixes (this session)
✅ ROOT CAUSES of cloud build failure: (1) /app/.gitignore had a SECOND duplicate .env/.env.*/*.env block at end of file — frontend/.env & backend/.env were still git-ignored (previous fix only removed the first block); (2) stale frontend/package-lock.json coexisted with yarn.lock (packageManager=yarn) — npm ci mismatch risk, DELETED; (3) patch-package was in devDependencies with "postinstall": "patch-package" — fails on production installs, MOVED to dependencies.
✅ Verified: `yarn install --frozen-lockfile` clean + patch applies; `npx expo export --platform web` EXIT 0 (2.91MB bundle); requirements.txt pip-installable (emergentintegrations==0.2.0 downloadable).
✅ Added frontend/.metro-cache/ to .gitignore (thousands of cache files were untracked).
