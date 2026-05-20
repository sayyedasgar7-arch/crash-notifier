// ============================================================
// firebase.js — Firebase setup
// This file connects the app to Firebase Firestore.
// It runs as an ES Module (type="module" in HTML).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- Firebase Config ----
// SECURITY: Key is safe here because Firebase Security Rules
// control who can read/write. Key alone cannot bypass Rules.
// See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey:            "AIzaSyDF1ko2QfrLCJUOeIDPWXqjN92yXbT1BeM",
  authDomain:        "crash-notifier-1763d.firebaseapp.com",
  projectId:         "crash-notifier-1763d",
  storageBucket:     "crash-notifier-1763d.firebasestorage.app",
  messagingSenderId: "340177230400",
  appId:             "1:340177230400:web:c866d7bff8335bc31f5da5"
};

// ---- Initialize Firebase ----
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// ---- Expose helpers to app.js (app.js is not a module) ----
window.CG_DB          = db;
window.CG_collection  = collection;
window.CG_addDoc      = addDoc;
window.CG_getDocs     = getDocs;
window.CG_orderBy     = orderBy;
window.CG_query       = query;
window.CG_limit       = limit;

// ---- Load crash history when Firebase is ready ----
window.addEventListener('load', () => {
  setTimeout(() => loadCrashHistory(), 500);
});

// ---- Load history from Firestore ----
async function loadCrashHistory() {
  try {
    const q = window.CG_query(
      window.CG_collection(window.CG_DB, 'crash_alerts'),
      window.CG_orderBy('timestamp', 'desc'),
      window.CG_limit(20)
    );
    const snapshot = await window.CG_getDocs(q);
    if (snapshot.empty) return;

    const logList  = document.getElementById('log-list');
    const logCount = document.getElementById('log-count');
    let count = 0;

    logList.innerHTML = '';

    snapshot.forEach(doc => {
      count++;
      appendLogItem(doc.data());
    });

    logCount.textContent = `${count} incident${count !== 1 ? 's' : ''}`;
    document.getElementById('stat-alerts').textContent = count;

  } catch (err) {
    console.error('Firestore load error:', err);
  }
}

// ---- Append one log item to DOM ----
// SECURITY: Using textContent everywhere — no innerHTML with user data
function appendLogItem(d) {
  const logList = document.getElementById('log-list');

  // Safely sanitize all values from Firestore
  const safeTimestamp = typeof d.timestamp === 'string' ? d.timestamp : '—';
  const safeType      = d.type === 'MANUAL' ? 'MANUAL' : 'AUTO';
  const safeUser      = typeof d.user    === 'string' ? d.user    : 'Unknown';
  const safeGForce    = typeof d.gForce  === 'string' ? d.gForce  : '—';
  const safeLat       = typeof d.lat     === 'string' ? d.lat     : 'Unknown';
  const safeLng       = typeof d.lng     === 'string' ? d.lng     : 'Unknown';

  const item = document.createElement('div');
  item.className = 'log-item';

  // SECURITY: Build DOM with textContent — never innerHTML for user data
  const dot = document.createElement('div');
  dot.className = 'log-dot';

  const info = document.createElement('div');

  const timeEl = document.createElement('div');
  timeEl.className = 'log-time';
  timeEl.textContent = `${safeTimestamp} — ${safeType}`;

  const detailEl = document.createElement('div');
  detailEl.className = 'log-detail';
  detailEl.textContent = `${safeUser} · ${safeGForce}G impact · ${
    safeLat !== 'Unknown' ? `${safeLat}, ${safeLng}` : 'No GPS'
  }`;

  info.appendChild(timeEl);
  info.appendChild(detailEl);
  item.appendChild(dot);
  item.appendChild(info);
  logList.appendChild(item);
}

// ---- Make appendLogItem accessible from app.js ----
window.CG_appendLogItem = appendLogItem;
