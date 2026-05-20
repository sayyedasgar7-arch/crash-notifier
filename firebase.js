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

// Your Firebase project config
const firebaseConfig = {
  apiKey:            "AIzaSyDF1ko2QfrLCJUOeIDPWXqjN92yXbT1BeM",
  authDomain:        "crash-notifier-1763d.firebaseapp.com",
  projectId:         "crash-notifier-1763d",
  storageBucket:     "crash-notifier-1763d.firebasestorage.app",
  messagingSenderId: "340177230400",
  appId:             "1:340177230400:web:c866d7bff8335bc31f5da5"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// Expose Firebase helpers to app.js via window object
// (Because app.js is a regular script, not a module)
window.CG_DB          = db;
window.CG_collection  = collection;
window.CG_addDoc      = addDoc;
window.CG_getDocs     = getDocs;
window.CG_orderBy     = orderBy;
window.CG_query       = query;
window.CG_limit       = limit;

// Load crash history when Firebase is ready
window.addEventListener('load', () => {
  // Small delay to let app.js initialize first
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

    // Clear "no incidents" placeholder
    logList.innerHTML = '';

    snapshot.forEach(doc => {
      count++;
      const d = doc.data();
      appendLogItem(d);
    });

    logCount.textContent = `${count} incident${count !== 1 ? 's' : ''}`;
    document.getElementById('stat-alerts').textContent = count;
  } catch (err) {
    console.error('Firestore load error:', err);
  }
}

// ---- Append one log item to the DOM ----
function appendLogItem(d) {
  const logList = document.getElementById('log-list');
  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <div class="log-dot"></div>
    <div>
      <div class="log-time">${d.timestamp} — ${d.type || 'AUTO'}</div>
      <div class="log-detail">${d.user} · ${d.gForce}G impact · ${d.lat !== 'Unknown' ? d.lat + ', ' + d.lng : 'No GPS'}</div>
    </div>
  `;
  logList.appendChild(item);
}

// Make appendLogItem accessible from app.js
window.CG_appendLogItem = appendLogItem;
