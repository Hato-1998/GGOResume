# 곽근오 게임 프로그래머 포트폴리오

게임 프로그래머 곽근오의 경력, 기술 스택, 프로젝트를 한데 담은 포트폴리오 사이트입니다.

## 특징

- 다크 모드 기본, 라이트 모드 토글 지원
- 노션 스타일의 미니멀 디자인
- 반응형 레이아웃 (모바일 최적화)
- 경력 기술서 기반 프로젝트 상세 페이지

## 로컬 미리보기

프로젝트 루트 디렉토리에서 Python 내장 서버를 실행하여 미리볼 수 있습니다:

```bash
python -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000` 또는 `http://localhost:8000/index.html`로 접속하세요.

## GitHub Pages 배포

이 저장소를 `Hato-1998.github.io` 계정의 Project Site로 배포하려면:

1. GitHub 저장소 Settings로 이동
2. Pages 섹션으로 이동
3. **Source**에서 "Deploy from a branch" 선택
4. Branch: `main`, Folder: `/ (root)` 선택
5. Save

배포 완료 후 `https://Hato-1998.github.io/GGOResume/`에서 사이트에 접속할 수 있습니다.

## 파일 구조

```
GGOResume/
├── index.html                       # 메인 페이지
├── README.md                        # 이 파일
├── .nojekyll                        # Jekyll 비활성화
├── assets/
│   ├── css/
│   │   ├── tokens.css              # 컬러, 타이포 CSS 변수
│   │   └── main.css                # 레이아웃 및 컴포넌트 스타일
│   ├── js/
│   │   └── theme-toggle.js         # 라이트/다크 테마 토글
│   └── images/
│       └── placeholders/            # 프로젝트 썸네일 SVG 플레이스홀더
└── projects/
    ├── klevathes-gimmick.html      # 클레바테스 콜라보 기믹 상세 페이지
    ├── tunnel-run.html             # 터널 런 미니게임 상세 페이지
    ├── ue5-topdown-rpg.html        # UE5 Top-Down RPG 상세 페이지
    └── fx-preview-browser.html     # FX Preview Browser 상세 페이지
```

## 이미지 교체

플레이스홀더 이미지는 `assets/images/placeholders/` 디렉토리에 위치합니다:

- `klevathes.svg` - 클레바테스 콜라보 기믹
- `tunnel-run.svg` - 터널 런 미니게임
- `fx-preview.svg` - FX Preview Browser
- `ue5-topdown-rpg.svg` - UE5 Top-Down RPG (Aura)
- `eldorado.svg` - Eldorado 프로젝트
- `hear.svg` - Hear 프로젝트

각 SVG를 실제 스크린샷이나 데모 이미지로 교체할 수 있습니다. 교체 시 `alt` 속성을 유지하여 접근성을 보장하세요.

## 라이센스

개인 포트폴리오 사이트입니다.
