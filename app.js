/**
 * NearGrid - Real-Time Community Alert Network Logic
 * Powered by Firebase & Leaflet.js
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// --- STATE ---
let map, userMarker, radiusCircle;
let alerts = [];
let userLocation = { lat: 26.9124, lng: 75.7873 };
let currentRadius = 2;
let currentUser = null;
let activeCats = new Set(['Safety','Traffic','Utilities','Health','Community','Fire']);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

window.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
  listenToAlerts();
});

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([userLocation.lat, userLocation.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  const userIcon = L.divIcon({
    className: 'custom-div-icon',
    html: "<div class='legend-pulse red' style='width:16px;height:16px'></div>",
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
  radiusCircle = L.circle([userLocation.lat, userLocation.lng], {
    radius: currentRadius * 1000,
    color: '#22d3ee',
    fillColor: '#22d3ee',
    fillOpacity: 0.08,
    weight: 1,
    dashArray: '5, 10'
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 300);
}

function setupEventListeners() {
  window.setRadius = (r) => {
    currentRadius = r;
    radiusCircle.setRadius(r * 1000);
    document.getElementById('statRadius').innerText = r + ' km';
    document.getElementById('feedRadius').innerText = r;
    document.querySelectorAll('#radiusChips .chip').forEach(c => c.classList.toggle('active', c.innerText.trim() === r + ' km'));
    renderAlerts();
  };

  window.handleAuth = () => {
    if (currentUser) auth.signOut();
    else signInWithPopup(auth, provider).catch(e => showToast('Auth failed: ' + e.message, 'error'));
  };

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      document.getElementById('authBtn').style.display = 'none';
      const av = document.getElementById('userAvatar');
      av.style.display = 'block';
      if (user.photoURL) av.style.backgroundImage = `url(${user.photoURL})`;
    } else {
      document.getElementById('authBtn').style.display = 'block';
      document.getElementById('userAvatar').style.display = 'none';
    }
  });

  window.openReportModal = () => document.getElementById('reportModal').style.display = 'flex';
  window.closeReportModal = () => document.getElementById('reportModal').style.display = 'none';
  window.closeModalOutside = (e) => { if (e.target.id === 'reportModal') window.closeReportModal(); };
  window.toggleFilters = () => {
    const fp = document.getElementById('filterPanel');
    fp.classList.toggle('collapsed');
  };
  window.updateCatFilter = () => {
    activeCats.clear();
    document.querySelectorAll('[data-cat]').forEach(cb => { if (cb.checked) activeCats.add(cb.dataset.cat); });
    renderAlerts();
  };
  window.selectCat = (btn) => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
  window.selectSev = (btn) => {
    document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
  window.locateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        userLocation.lat = pos.coords.latitude;
        userLocation.lng = pos.coords.longitude;
        map.setView([userLocation.lat, userLocation.lng], 14);
        userMarker.setLatLng([userLocation.lat, userLocation.lng]);
        radiusCircle.setLatLng([userLocation.lat, userLocation.lng]);
        renderAlerts();
      });
    }
  };
  window.filterFeed = () => renderAlerts();
}

function listenToAlerts() {
  try {
    const q = query(collection(db, "alerts"));
    onSnapshot(q, (snapshot) => {
      alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      alerts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      document.getElementById('syncText').innerText = 'Grid Synced';
      const syncEl = document.getElementById('syncStatus');
      if (syncEl) { syncEl.style.background = 'rgba(16,185,129,0.15)'; syncEl.querySelector('.sync-dot').style.background = '#10b981'; }
      document.getElementById('statAlerts').innerText = alerts.length;
      document.getElementById('statNodes').innerText = Math.floor(Math.random() * 20) + 5;
      document.getElementById('onlineCount').innerText = Math.floor(Math.random() * 50) + 10;
      renderAlerts();
    }, (err) => {
      console.error('Firestore error:', err);
      document.getElementById('syncText').innerText = 'Connection Error';
    });
  } catch(e) {
    console.error('Firebase init error:', e);
    document.getElementById('syncText').innerText = 'Offline Mode';
  }
}

window.submitAlert = async () => {
  const title = document.getElementById('alertTitle').value.trim();
  if (!title) { showToast('Please enter an alert title', 'error'); return; }
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try {
    await addDoc(collection(db, "alerts"), {
      title,
      category: document.querySelector('.cat-btn.active')?.dataset?.cat || 'Safety',
      severity: document.querySelector('.sev-btn.active')?.dataset?.sev || 'Medium',
      description: document.getElementById('alertDesc').value.trim(),
      lat: userLocation.lat,
      lng: userLocation.lng,
      createdAt: serverTimestamp(),
      userName: currentUser ? currentUser.displayName : "Guest Node"
    });
    showToast('Alert submitted successfully!', 'success');
    window.closeReportModal();
    document.getElementById('alertTitle').value = '';
    document.getElementById('alertDesc').value = '';
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
  btn.disabled = false;
};

function renderAlerts() {
  const feed = document.getElementById('alertFeed');
  const searchVal = (document.getElementById('alertSearch')?.value || '').toLowerCase();
  const filtered = alerts.filter(a => {
    const dist = getDistance(userLocation.lat, userLocation.lng, a.lat || userLocation.lat, a.lng || userLocation.lng);
    const inRadius = dist <= currentRadius;
    const inCat = activeCats.has(a.category);
    const matchesSearch = !searchVal || (a.title || '').toLowerCase().includes(searchVal) || (a.category || '').toLowerCase().includes(searchVal);
    return inRadius && inCat && matchesSearch;
  });
  const emptyState = document.getElementById('emptyState');
  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    feed.querySelectorAll('.ng-alert-card').forEach(c => c.remove());
  } else {
    if (emptyState) emptyState.style.display = 'none';
    feed.querySelectorAll('.ng-alert-card').forEach(c => c.remove());
    const catColors = { Safety:'#ef4444', Traffic:'#f59e0b', Utilities:'#3b82f6', Health:'#22d3ee', Community:'#a78bfa', Fire:'#fb923c' };
    filtered.forEach(a => {
      const card = document.createElement('div');
      card.className = 'ng-alert-card';
      const col = catColors[a.category] || '#22d3ee';
      const timeStr = a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now';
      card.innerHTML = `
        <div class="alert-card-top">
          <span class="alert-cat-badge" style="background:${col}22;color:${col};border:1px solid ${col}44">${a.category}</span>
          <span class="alert-time">${timeStr}</span>
        </div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-meta">by ${a.userName || 'Anonymous Node'}</div>
      `;
      feed.appendChild(card);
      // Add marker on map
      if (a.lat && a.lng) {
        const icon = L.divIcon({ className:'', html:`<div style="width:10px;height:10px;border-radius:50%;background:${col};border:2px solid white;box-shadow:0 0 8px ${col}"></div>`, iconSize:[10,10], iconAnchor:[5,5] });
        L.marker([a.lat, a.lng], { icon }).addTo(map).bindPopup(`<b>${a.category}</b>: ${a.title}`);
      }
    });
  }
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'ng-toast ' + type;
  t.innerText = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
