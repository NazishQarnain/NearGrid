/**
 * NearGrid - Real-Time Community Alert Network Logic
 * Powered by Firebase & Leaflet.js
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, serverTimestamp, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// --- STATE ---
let map, userMarker, radiusCircle;
let alerts = [];
let userLocation = { lat: 26.9124, lng: 75.7873 }; 
let currentRadius = 2;
let currentUser = null;

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
    fillOpacity: 0.1,
    weight: 1,
    dashArray: '5, 10'
  }).addTo(map);
}

function setupEventListeners() {
  window.setRadius = (r) => {
    currentRadius = r;
    radiusCircle.setRadius(r * 1000);
    document.getElementById('statRadius').innerText = r + ' km';
    document.getElementById('feedRadius').innerText = r;
    document.querySelectorAll('#radiusChips .chip').forEach(c => c.classList.toggle('active', c.innerText.includes(r)));
    renderAlerts();
  };

  window.handleAuth = () => {
    if (currentUser) auth.signOut();
    else signInWithPopup(auth, provider);
  };

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      document.getElementById('authBtn').style.display = 'none';
      document.getElementById('userAvatar').style.display = 'block';
      document.getElementById('userAvatar').style.backgroundImage = `url(${user.photoURL})`;
    } else {
      document.getElementById('authBtn').style.display = 'block';
      document.getElementById('userAvatar').style.display = 'none';
    }
  });

  window.openReportModal = () => document.getElementById('reportModal').style.display = 'flex';
  window.closeReportModal = () => document.getElementById('reportModal').style.display = 'none';
}

function listenToAlerts() {
  const q = query(collection(db, "alerts"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById('syncText').innerText = 'Grid Synced';
    renderAlerts();
  });
}

window.submitAlert = async () => {
  const title = document.getElementById('alertTitle').value;
  if (!title) return;
  await addDoc(collection(db, "alerts"), {
    title,
    category: document.querySelector('.cat-btn.active').dataset.cat,
    lat: userLocation.lat,
    lng: userLocation.lng,
    createdAt: serverTimestamp(),
    userName: currentUser ? currentUser.displayName : "Guest Node"
  });
  closeReportModal();
};

function renderAlerts() {
  const feed = document.getElementById('alertFeed');
  const filtered = alerts.filter(a => getDistance(userLocation.lat, userLocation.lng, a.lat, a.lng) <= currentRadius);
  feed.innerHTML = filtered.length ? "" : "<p>No alerts in radius</p>";
  filtered.forEach(a => {
    const card = document.createElement('div');
    card.className = 'ng-alert-card';
    card.innerHTML = `<strong>${a.category}</strong>: ${a.title}`;
    feed.appendChild(card);
  });
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
