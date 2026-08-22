# PR 요약

<!-- 1~3줄 · 무엇을·왜 -->

## 변경 유형

- [ ] feat · 신규 기능
- [ ] fix · 버그 수정
- [ ] refactor · 리팩터링 (기능 변경 없음)
- [ ] docs · 문서만
- [ ] test · 테스트만
- [ ] chore · 빌드·툴링

## 프레임워크 체크리스트

- [ ] `useToast` 사용 (raw `alert()` 미사용)
- [ ] `useConfirm` 사용 (raw `window.confirm()` 미사용)
- [ ] `apiClient` / `api.get/post/put` 사용 (raw `fetch()` 미사용)
- [ ] `Card` 프리미티브 사용 (raw `bg-white border rounded` div 미사용)
- [ ] `Spinner` 프리미티브 사용 (raw `<Loader2 className="animate-spin">` 미사용)
- [ ] 500 라인 초과 파일 · types / helpers / subcomponents 로 분리
- [ ] Zod 스키마 활용 (server 입력 검증)
- [ ] `npm run audit:check` PASS (pre-commit 자동 · 재확인용)

## 검증

- [ ] `npm run lint` (TypeScript 통과)
- [ ] `npm test` (Vitest 통과)
- [ ] `npm run build` (Vite 빌드 통과)
- [ ] 브라우저 실제 확인 (해당 시)
- [ ] 회귀 없음 · 기존 기능 100% 유지

## 관련 문서 · 링크

<!-- TASKS.md 번호 · Issue · 관련 커밋 등 -->

## 스크린샷 (UI 변경 시)

<!-- Before / After 이미지 -->
