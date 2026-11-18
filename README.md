# 강한 놀이터 (Supabase 버전)

정적 사이트입니다. 빌드 없이 그대로 Vercel/GitHub Pages 등에 올리면 됩니다.

## 파일
- `index.html` — 게임 전체
- `supabase-bridge.js` — Supabase 연결(같이 놀기·기록판·출석). 맨 위 `CFG`에 프로젝트 URL과 publishable key가 들어 있습니다.
- `supabase-setup.sql` — Supabase에서 한 번 실행할 SQL
- `vendor/` — three.js, supabase-js (외부 CDN 없이 동작)

## 설정 순서
1. Supabase 대시보드 → **SQL Editor** → `supabase-setup.sql` 전체 붙여 넣고 **Run**
2. **Authentication → Sign In / Providers → Anonymous Sign-Ins** 를 **켜기** (기록 저장에 필요)
3. 이 폴더를 GitHub에 올리고 Vercel에서 저장소를 Import (Framework: Other, 빌드 명령 없음)

## 동작 방식
- 같이 놀기: Supabase Realtime broadcast (채널 `kp-lobby`), 테이블 없음
- 기록판/출석: `records` 테이블. 누구나 읽기, 쓰기는 본인 행만 (RLS)
- Supabase에 연결이 안 되면 자동으로 혼자 노는 모드로 계속 동작합니다.

## 알아둘 점
- publishable key는 공개돼도 되는 키입니다. `sb_secret_...`/`service_role` 키는 절대 넣지 마세요.
- 서버가 기록 범위(체공 8초, 지구본 220km/h 등)만 검사합니다. 완벽한 부정 방지는 아닙니다.
- 이상한 닉네임은 Table Editor에서 `records`의 해당 행을 지우세요.
