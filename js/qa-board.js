// ================================================================
// qa-board.js
// Firebase Firestore + Google Auth 기반 Q&A 게시판
// - 누구나 질문 등록 / 읽기
// - 관리자(특정 이메일)만 Google 로그인 후 답글 작성
// ================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Firebase 초기화 ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCnNt0GiLR5fu0t0HnBeQVfCVEM2lnCg0A",
  authDomain: "total-polution.firebaseapp.com",
  projectId: "total-polution",
  storageBucket: "total-polution.firebasestorage.app",
  messagingSenderId: "298848249988",
  appId: "1:298848249988:web:0195c06cfdd1d52bd67ad1"
};

const ADMIN_EMAILS = ["dnffpr2@gmail.com"];

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// ── 관리자 여부 ─────────────────────────────────────────────────
function isAdmin(user) {
  return user && ADMIN_EMAILS.includes(user.email);
}

// ── 날짜 포맷 ───────────────────────────────────────────────────
function fmt(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

// ── 탭 진입 시 초기화 ───────────────────────────────────────────
export function initQaBoard() {
  renderAuthBar();
  subscribePostList();

  onAuthStateChanged(auth, user => {
    currentUser = user;
    renderAuthBar();
  });

  document.getElementById("qa-post-form")?.addEventListener("submit", handlePostSubmit);
}

// ── 로그인 바 렌더 ──────────────────────────────────────────────
function renderAuthBar() {
  const bar = document.getElementById("qa-auth-bar");
  if (!bar) return;
  if (currentUser && isAdmin(currentUser)) {
    bar.innerHTML = `
      <span style="font-size:12px;color:#1a7f64;font-weight:700;">관리자 로그인: ${currentUser.email}</span>
      <button id="qa-logout-btn" style="font-size:12px;padding:3px 10px;border-radius:6px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer;margin-left:8px;">로그아웃</button>`;
    document.getElementById("qa-logout-btn")?.addEventListener("click", () => signOut(auth));
  } else {
    bar.innerHTML = `
      <button id="qa-login-btn" style="font-size:12px;padding:4px 14px;border-radius:6px;border:none;background:#4285f4;color:#fff;cursor:pointer;font-weight:700;">
        Google 관리자 로그인
      </button>`;
    document.getElementById("qa-login-btn")?.addEventListener("click", () =>
      signInWithPopup(auth, provider).catch(e => alert("로그인 실패: " + e.message))
    );
  }
}

// ── 질문 등록 ───────────────────────────────────────────────────
async function handlePostSubmit(e) {
  e.preventDefault();
  const nameEl    = document.getElementById("qa-name");
  const titleEl   = document.getElementById("qa-title");
  const contentEl = document.getElementById("qa-content");
  const name    = nameEl.value.trim();
  const title   = titleEl.value.trim();
  const content = contentEl.value.trim();
  if (!title || !content) { alert("제목과 내용을 입력하세요."); return; }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "posts"), {
      name: name || "익명",
      title,
      content,
      createdAt: Timestamp.now(),
      replies: []
    });
    nameEl.value = ""; titleEl.value = ""; contentEl.value = "";
  } catch(err) {
    alert("등록 실패: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── 게시글 실시간 구독 ──────────────────────────────────────────
function subscribePostList() {
  const listEl = document.getElementById("qa-post-list");
  if (!listEl) return;
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    window.__qaPosts = {};
    snap.forEach(d => { window.__qaPosts[d.id] = { id: d.id, ...d.data() }; });
    renderPostList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── 게시글 목록 렌더 ────────────────────────────────────────────
function renderPostList(posts) {
  const listEl = document.getElementById("qa-post-list");
  if (!listEl) return;
  if (!posts.length) {
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px;">등록된 질문이 없습니다.</div>`;
    return;
  }
  listEl.innerHTML = posts.map((p, i) => `
    <div class="qa-post-item" data-id="${p.id}" onclick="window.__qaToggle('${p.id}')">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:11px;color:#9ca3af;flex-shrink:0;">${posts.length - i}</span>
        <span style="font-size:13px;font-weight:700;flex:1;min-width:0;">${esc(p.title)}</span>
        ${(p.replies||[]).length ? `<span style="font-size:11px;background:#dcfce7;color:#16a34a;padding:2px 7px;border-radius:10px;flex-shrink:0;">답변완료</span>` : `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;flex-shrink:0;">대기중</span>`}
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">${esc(p.name)} · ${fmt(p.createdAt)}</div>
    </div>
    <div id="qa-detail-${p.id}" style="display:none;">
      ${renderDetail(p)}
    </div>
  `).join("");
}

// ── 게시글 상세 렌더 ────────────────────────────────────────────
function renderDetail(p) {
  const repliesHtml = (p.replies||[]).map(r => `
    <div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:10px 14px;border-radius:0 8px 8px 0;margin-top:8px;">
      <div style="font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px;">관리자 답변 · ${fmt(r.createdAt)}</div>
      <div style="font-size:13px;white-space:pre-wrap;">${esc(r.content)}</div>
    </div>`).join("");

  const replyForm = (currentUser && isAdmin(currentUser)) ? `
    <div style="margin-top:12px;">
      <textarea id="qa-reply-${p.id}" placeholder="답변을 입력하세요..." rows="3"
        style="width:100%;font-size:13px;border-radius:8px;border:1px solid #d1d5db;padding:8px;box-sizing:border-box;resize:vertical;"></textarea>
      <button onclick="window.__qaReply('${p.id}')"
        style="margin-top:6px;padding:6px 18px;background:#1a7f64;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:700;">
        답변 등록
      </button>
    </div>` : (currentUser ? "" : `<div style="font-size:12px;color:#9ca3af;margin-top:10px;">답변은 관리자만 작성할 수 있습니다.</div>`);

  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:4px;">
      <div style="font-size:13px;white-space:pre-wrap;margin-bottom:10px;">${esc(p.content)}</div>
      ${repliesHtml}
      ${replyForm}
    </div>`;
}

// ── 토글 열기/닫기 ──────────────────────────────────────────────
window.__qaToggle = function(id) {
  const el = document.getElementById("qa-detail-" + id);
  if (!el) return;
  const open = el.style.display !== "none";
  el.style.display = open ? "none" : "block";
  if (!open) {
    const p = window.__qaPosts?.[id];
    if (p) el.innerHTML = renderDetail(p);
  }
};

// ── 답변 등록 ───────────────────────────────────────────────────
window.__qaReply = async function(postId) {
  if (!currentUser || !isAdmin(currentUser)) { alert("관리자만 답변할 수 있습니다."); return; }
  const ta = document.getElementById("qa-reply-" + postId);
  const content = ta?.value.trim();
  if (!content) { alert("답변 내용을 입력하세요."); return; }
  try {
    await updateDoc(doc(db, "posts", postId), {
      replies: arrayUnion({ content, createdAt: Timestamp.now() })
    });
    ta.value = "";
  } catch(err) {
    alert("답변 등록 실패: " + err.message);
  }
};

// ── XSS 방지 ────────────────────────────────────────────────────
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
