# Omni Workspace — Agent Guide

## 한 줄 정의
API 기반 멀티 LLM 앱이 아니라, 공식 AI 웹앱(Claude/ChatGPT/Gemini)을 사용자 본인 계정으로 웹뷰에 띄우는 AI 워크스페이스 브라우저.
핵심 가치는 모델 비교가 아니라 워크스페이스 저장/복원, 메모, 프롬프트 라이브러리, 텍스트 브로드캐스트.

## 현재 우선순위 (1인 개발)
1. omni-windows (Electron + React + TypeScript + Vite) — 최우선
2. omni-android, omni-apple은 아직 빈 폴더, 코드 작성 시작 안 함

## 지금 단계에서 하지 말 것
- 파일 첨부 (v1.1로 보류, MVP 아님)
- AI 간 실시간 자동 협업/라운드 핑퐁 (영구 제외, ToS 그레이존 + 유지보수 불가)
- "완료 시점 자동 감지" 로직 (캡처는 항상 사용자 트리거)
- Phase 2 기능(AI 라우팅 추천, 캡처 비교) — API 비용 발생하는 건 전부 나중

## omni-windows 마일스톤 순서
1. BrowserWindow + WebView로 claude.ai 하나 띄우고 로그인 세션 유지 확인
2. partition 분리로 webview 2개(Claude, ChatGPT) 세션 격리 검증 — 핵심 기술 가정
3. 현재 URL 저장 → 재실행 후 복원
4. 텍스트 브로드캐스트 (입력창 하나 → 양쪽 웹뷰에 동시 입력+전송)
5. 패키징(.exe)은 1주차 목표 아님

## 아키텍처 원칙
- DOM 셀렉터 의존 기능(브로드캐스트, 캡처)은 Provider별 어댑터 패턴으로 분리 — 하나 고치다 다른 거 건드리지 않게
