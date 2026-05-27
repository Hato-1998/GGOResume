/* GGOResume HTML 편집기 클라이언트 */
'use strict';

const $ = (id) => document.getElementById(id);

let currentPath = null;
let lastSavedContent = '';
let isDirty = false;
let previewTimer = null;

const editor = $('editor');
const preview = $('preview');
const tree = $('tree');
const statusEl = $('status');
const btnSave = $('btn-save');
const btnNew = $('btn-new');
const btnDeploy = $('btn-deploy');
const deployCount = $('deploy-count');
const editorStats = $('editor-stats');

// ============================================================
// 파일 트리
// ============================================================

async function loadTree() {
    try {
        const r = await fetch('/api/files');
        const data = await r.json();
        tree.innerHTML = '';
        for (const g of data.groups) {
            const h = document.createElement('div');
            h.className = 'section-header';
            h.textContent = g.name;
            tree.appendChild(h);
            for (const f of g.files) {
                const a = document.createElement('a');
                a.className = 'file-link';
                a.textContent = f.name;
                a.dataset.path = f.path;
                a.title = f.path;
                a.addEventListener('click', () => loadFile(f.path));
                tree.appendChild(a);
            }
        }
    } catch (e) {
        tree.innerHTML = '<div style="color:red;padding:12px">트리 로드 실패: ' + e.message + '</div>';
    }
}

// ============================================================
// 파일 로드/저장
// ============================================================

async function loadFile(path) {
    if (isDirty && !confirm('수정 내용이 저장되지 않았습니다. 버리고 다른 파일을 열까요?')) return;
    try {
        const r = await fetch('/api/file?path=' + encodeURIComponent(path));
        const data = await r.json();
        if (!r.ok || data.error) {
            setStatus('error', '로드 실패: ' + (data.error || r.status));
            return;
        }
        currentPath = path;
        editor.value = data.content;
        lastSavedContent = data.content;
        isDirty = false;
        btnSave.disabled = true;
        setStatus('saved', path);
        renderPreview();
        updateStats();
        document.querySelectorAll('.file-link').forEach(el =>
            el.classList.toggle('active', el.dataset.path === path));
    } catch (e) {
        setStatus('error', '로드 오류: ' + e.message);
    }
}

async function saveFile() {
    if (!currentPath) return;
    try {
        const r = await fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, content: editor.value }),
        });
        const data = await r.json();
        if (!r.ok || data.error) {
            setStatus('error', '저장 실패: ' + (data.error || r.status));
            return;
        }
        lastSavedContent = editor.value;
        isDirty = false;
        btnSave.disabled = true;
        setStatus('saved', `저장됨 · ${data.bytes} bytes · ${currentPath}`);
        refreshGitStatus();
    } catch (e) {
        setStatus('error', '저장 오류: ' + e.message);
    }
}

function setStatus(kind, text) {
    statusEl.className = 'status ' + (kind || '');
    statusEl.textContent = text;
}

function updateStats() {
    const lines = editor.value.split('\n').length;
    const chars = editor.value.length;
    editorStats.textContent = `${lines}줄 · ${chars}자`;
}

// ============================================================
// 미리보기 (iframe srcdoc + base href 주입)
// ============================================================

function getBaseHref() {
    // 현재 파일의 디렉토리 기준 base. 루트 파일이면 "/raw/", projects/foo면 "/raw/projects/"
    if (!currentPath) return `${location.origin}/raw/`;
    const slash = currentPath.lastIndexOf('/');
    const dir = slash >= 0 ? currentPath.substring(0, slash + 1) : '';
    return `${location.origin}/raw/${dir}`;
}

function renderPreview() {
    let html = editor.value || '<p style="font-family:sans-serif;color:#999;padding:20px">미리보기 없음</p>';
    const baseTag = `<base href="${getBaseHref()}">`;
    // <head> 안에 base 삽입. 없으면 맨 앞에.
    if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, m => m + '\n  ' + baseTag);
    } else if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/<html[^>]*>/i, m => m + '\n<head>' + baseTag + '</head>');
    } else {
        html = baseTag + html;
    }
    preview.srcdoc = html;
}

// 편집 이벤트
editor.addEventListener('input', () => {
    isDirty = (editor.value !== lastSavedContent);
    btnSave.disabled = !isDirty;
    setStatus(isDirty ? 'dirty' : 'saved', isDirty ? `수정됨 · ${currentPath || ''}` : (currentPath || ''));
    updateStats();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 250);
});

editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
    }
    // Tab 키로 들여쓰기 (2스페이스)
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        editor.dispatchEvent(new Event('input'));
    }
});

window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
});

btnSave.addEventListener('click', saveFile);

$('btn-refresh-preview').addEventListener('click', renderPreview);
$('btn-open-tab').addEventListener('click', () => {
    if (currentPath) window.open(`/raw/${currentPath}`, '_blank');
});

// ============================================================
// 편집 보조 스니펫
// ============================================================

const SNIPPETS = {
    section: () => `\n<section class="section">\n  <h2>섹션 제목</h2>\n  <p>내용</p>\n</section>\n`,
    link: () => {
        const label = prompt('표시 텍스트:', '') || '링크';
        const href = prompt('URL 또는 경로:', '') || '#';
        return `<a href="${href}">${label}</a>`;
    },
    img: () => {
        const src = prompt('이미지 경로 (예: assets/img/screen.png):', '') || 'assets/img/placeholder.png';
        const alt = prompt('대체 텍스트:', '') || '';
        return `<img src="${src}" alt="${alt}" loading="lazy">`;
    },
    card: () => `\n<div class="card">\n  <h3>카드 제목</h3>\n  <p>설명</p>\n</div>\n`,
    todo: () => {
        const text = prompt('TODO 내용:', '') || '';
        return `<!-- TODO: ${text} -->`;
    },
    comment: () => `\n<!--\n메모: \n-->\n`,
};

document.querySelectorAll('.tool-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
        const fn = SNIPPETS[btn.dataset.action];
        if (!fn) return;
        insertAtCursor(fn());
    });
});

function insertAtCursor(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + text + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + text.length;
    editor.focus();
    editor.dispatchEvent(new Event('input'));
}

// ============================================================
// 새 페이지 모달
// ============================================================

const newModal = $('new-modal');
const newSlug = $('new-slug');
const newTitle = $('new-title');
const newLocation = $('new-location');
const newError = $('new-error');

btnNew.addEventListener('click', () => {
    newError.hidden = true;
    newSlug.value = '';
    newTitle.value = '';
    newModal.hidden = false;
    newSlug.focus();
});

$('btn-cancel').addEventListener('click', () => { newModal.hidden = true; });

$('btn-create').addEventListener('click', async () => {
    newError.hidden = true;
    const slug = newSlug.value.trim();
    const title = newTitle.value.trim();
    const in_projects = newLocation.value === 'projects';
    if (!slug) {
        newError.textContent = '슬러그는 필수입니다.';
        newError.hidden = false;
        return;
    }
    try {
        const r = await fetch('/api/page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, title, in_projects }),
        });
        const data = await r.json();
        if (!r.ok || data.error) {
            newError.textContent = data.error || '생성 실패';
            newError.hidden = false;
            return;
        }
        newModal.hidden = true;
        await loadTree();
        await loadFile(data.path);
    } catch (e) {
        newError.textContent = e.message;
        newError.hidden = false;
    }
});

newModal.addEventListener('click', (e) => {
    if (e.target === newModal) newModal.hidden = true;
});

// ============================================================
// 배포 모달
// ============================================================

const deployModal = $('deploy-modal');
const deployStatus = $('deploy-status');
const deployFilesWrap = $('deploy-files-wrap');
const deployFiles = $('deploy-files');
const deployFilesSummary = $('deploy-files-summary');
const deployMessage = $('deploy-message');
const deployProgress = $('deploy-progress');
const deployError = $('deploy-error');
const deploySuccess = $('deploy-success');
const btnDeployCancel = $('btn-deploy-cancel');
const btnDeployConfirm = $('btn-deploy-confirm');

async function refreshGitStatus() {
    try {
        const r = await fetch('/api/git/status');
        const data = await r.json();
        if (!data.git_repo || data.error) {
            deployCount.textContent = '';
            return data;
        }
        const total = (data.changed || []).length + (data.untracked || []).length + (data.ahead || 0);
        deployCount.textContent = total > 0 ? String(total) : '';
        return data;
    } catch (e) {
        deployCount.textContent = '';
        return { error: e.message };
    }
}

btnDeploy.addEventListener('click', async () => {
    deployError.hidden = true;
    deploySuccess.hidden = true;
    deployProgress.hidden = true;
    btnDeployConfirm.disabled = false;
    deployFilesWrap.hidden = true;

    deployStatus.className = 'deploy-status';
    deployStatus.textContent = '상태 확인 중…';
    deployModal.hidden = false;

    const data = await refreshGitStatus();
    if (data.error) {
        deployStatus.textContent = '오류: ' + data.error;
        btnDeployConfirm.disabled = true;
        return;
    }
    const changed = data.changed || [];
    const untracked = data.untracked || [];
    const ahead = data.ahead || 0;
    const total = changed.length + untracked.length + ahead;
    if (total === 0) {
        deployStatus.className = 'deploy-status clean';
        deployStatus.textContent = `변경사항 없음 (${data.branch})`;
        btnDeployConfirm.disabled = true;
        return;
    }
    deployStatus.className = 'deploy-status dirty';
    const parts = [];
    if (changed.length) parts.push(`수정 ${changed.length}`);
    if (untracked.length) parts.push(`신규 ${untracked.length}`);
    if (ahead) parts.push(`미푸시 ${ahead}`);
    deployStatus.textContent = `${data.branch}: ${parts.join(' · ')}`;

    deployFiles.innerHTML = '';
    for (const f of changed) {
        const li = document.createElement('li');
        li.textContent = `[${f.status || ' M'}] ${f.path}`;
        deployFiles.appendChild(li);
    }
    for (const p of untracked) {
        const li = document.createElement('li');
        li.textContent = `[??] ${p}`;
        deployFiles.appendChild(li);
    }
    deployFilesSummary.textContent = `변경된 파일 (${changed.length + untracked.length})`;
    deployFilesWrap.hidden = (changed.length + untracked.length) === 0;
});

btnDeployCancel.addEventListener('click', () => { deployModal.hidden = true; });
deployModal.addEventListener('click', (e) => { if (e.target === deployModal) deployModal.hidden = true; });

btnDeployConfirm.addEventListener('click', async () => {
    const msg = deployMessage.value.trim() || 'docs: update portfolio via editor';
    deployError.hidden = true;
    deploySuccess.hidden = true;
    deployProgress.hidden = false;
    btnDeployConfirm.disabled = true;
    try {
        const r = await fetch('/api/git/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg }),
        });
        const data = await r.json();
        deployProgress.hidden = true;
        if (!r.ok || data.error) {
            deployError.textContent = (data.error || '실패') + (data.log ? '\n\n' + data.log : '');
            deployError.hidden = false;
            btnDeployConfirm.disabled = false;
            return;
        }
        deploySuccess.innerHTML =
            (data.committed ? '커밋 + push 완료. ' : 'push 완료 (새 커밋 없음). ') +
            'GitHub Pages가 사이트를 갱신합니다 (30초~2분).<br>' +
            '<a href="https://hato-1998.github.io/GGOResume/" target="_blank">사이트 열기</a>';
        deploySuccess.hidden = false;
        await refreshGitStatus();
        setTimeout(() => { deployModal.hidden = true; }, 5000);
    } catch (e) {
        deployProgress.hidden = true;
        deployError.textContent = '오류: ' + e.message;
        deployError.hidden = false;
        btnDeployConfirm.disabled = false;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!newModal.hidden) newModal.hidden = true;
        if (!deployModal.hidden) deployModal.hidden = true;
    }
});

setInterval(refreshGitStatus, 30000);

// ============================================================
// 초기 로드
// ============================================================

loadTree();
updateStats();
refreshGitStatus();
