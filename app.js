// ============================================================
// app.js — CrashGuard Main Application Logic
//
// Handles:
//   1. Setup / profile saving
//   2. Sensor permission + reading
//   3. Monitoring start/stop
//   4. Crash detection
//   5. Countdown popup
//   6. Alert sending (Firebase + GPS)
// ============================================================


// ============================================================
// SECTION 1: APP STATE
// These variables hold the current state of the app.
// ============================================================

let userData    = {};       // Stores user name + emergency contact
let monitoring  = false;    // Is crash monitoring ON?
let sensorReady = false;    // Has the user granted sensor permission?
let crashTimer  = null;     // Reference to the countdown interval
let countdown   = 30;       // Seconds before auto-alert

// Last known accelerometer values
let accel = { x: 0, y: 0, z: 0 };

// Crash detection threshold in m/s²
// 2.5G = 24.5 m/s². Adjust higher to reduce false positives.
const CRASH_THRESHOLD = 24.5;

// Counter for how many alerts have been sent this session
let alertCount = 0;


// ============================================================
// SECTION 2: SCREEN NAVIGATION
// Shows one screen, hides all others.
// ============================================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
  window.scrollTo(0, 0);
}


// ============================================================
// SECTION 3: SETUP SCREEN
// ============================================================

// Called when user taps "Continue →" on setup screen
function handleSetup() {
  const name    = document.getElementById('inp-name').value.trim();
  const cName   = document.getElementById('inp-contact-name').value.trim();
  const cNum    = document.getElementById('inp-contact-num').value.trim();

  // Validate all fields are filled
  if (!name || !cName || !cNum) {
    alert('Please fill in all fields.');
    return;
  }

  // Save to localStorage so user doesn't need to re-enter
  userData = { name, contactName: cName, contactNum: cNum };
  localStorage.setItem('cg_user', JSON.stringify(userData));

  applyUserToUI();
  showScreen('screen-dashboard');
}

// Pushes user data into dashboard UI elements
function applyUserToUI() {
  document.getElementById('greeting-name').textContent = `Hello, ${userData.name.split(' ')[0]}.`;
  document.getElementById('contact-name-disp').textContent = userData.contactName;
  document.getElementById('contact-num-disp').textContent  = userData.contactNum;

  // Show first letter of contact name as avatar
  const initial = userData.contactName.charAt(0).toUpperCase();
  document.getElementById('contact-avatar').textContent = initial;
}

// Called when user taps "Edit" on contact card
function editContact() {
  // Pre-fill fields and go back to setup screen
  document.getElementById('inp-name').value          = userData.name;
  document.getElementById('inp-contact-name').value  = userData.contactName;
  document.getElementById('inp-contact-num').value   = userData.contactNum;
  showScreen('screen-setup');
}


// ============================================================
// SECTION 4: AUTO-LOGIN
// If user has already set up, skip setup screen.
// ============================================================

window.addEventListener('load', () => {
  const saved = localStorage.getItem('cg_user');
  if (saved) {
    userData = JSON.parse(saved);
    applyUserToUI();
    showScreen('screen-dashboard');
  }
});


// ============================================================
// SECTION 5: SENSOR PERMISSION
// DeviceMotion needs user permission on iOS 13+.
// Android grants it automatically.
// ============================================================

function requestSensor() {
  // Check if browser supports motion events
  if (typeof DeviceMotionEvent === 'undefined') {
    alert('Motion sensors not supported. Please open this app on a mobile phone.');
    return;
  }

  // iOS 13+ requires explicit permission request
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(result => {
        if (result === 'granted') {
          activateSensor();
        } else {
          alert('Sensor permission denied. Cannot detect crashes without motion access.');
        }
      })
      .catch(err => console.error('Sensor permission error:', err));
  } else {
    // Android and older browsers — no permission needed
    activateSensor();
  }
}

// Called after permission is granted
function activateSensor() {
  sensorReady = true;

  // Show sensor data card
  document.getElementById('sensor-card').style.display   = 'block';
  document.getElementById('sensor-notice').style.display = 'none';

  // Enable the Start button
  document.getElementById('btn-start').disabled = false;

  // Start listening to device motion events
  window.addEventListener('devicemotion', handleMotion);

  // Update sensor button to show it's done
  document.getElementById('btn-sensor').textContent  = '✓ Sensors Active';
  document.getElementById('btn-sensor').style.color  = 'var(--green)';
  document.getElementById('btn-sensor').style.borderColor = 'var(--green)';
  document.getElementById('btn-sensor').disabled = true;
}


// ============================================================
// SECTION 6: MOTION EVENT HANDLER
// Reads accelerometer + calculates G-force impact.
// ============================================================

function handleMotion(event) {
  // Only process if monitoring is active
  if (!monitoring) return;

  // Use accelerationIncludingGravity (most reliable on mobile)
  const a = event.accelerationIncludingGravity || event.acceleration;
  if (!a) return;

  accel.x = a.x || 0;
  accel.y = a.y || 0;
  accel.z = a.z || 0;

  // Update live values in UI
  document.getElementById('val-x').textContent = Math.abs(accel.x).toFixed(2);
  document.getElementById('val-y').textContent = Math.abs(accel.y).toFixed(2);
  document.getElementById('val-z').textContent = Math.abs(accel.z).toFixed(2);

  // Calculate total force magnitude using Pythagorean theorem
  const magnitude = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
  const gForce    = magnitude / 9.8;   // Convert m/s² to G

  // Update G-force stat
  document.getElementById('stat-gforce').textContent = gForce.toFixed(2) + ' G';

  // Update impact bar (cap at 100%)
  const barPct  = Math.min((magnitude / (CRASH_THRESHOLD * 1.4)) * 100, 100);
  const bar     = document.getElementById('impact-bar');
  bar.style.width = barPct + '%';

  // Color the bar based on intensity
  bar.classList.remove('warn', 'danger');
  if (gForce > 2.5)      bar.classList.add('danger');
  else if (gForce > 1.5) bar.classList.add('warn');

  // Color Z value if extreme
  document.getElementById('val-z').classList.toggle('danger', Math.abs(accel.z) > 20);

  // ---- CRASH DETECTION ----
  // Only trigger if no countdown is already running
  if (magnitude > CRASH_THRESHOLD && !crashTimer) {
    triggerCrashAlert(gForce);
  }
}


// ============================================================
// SECTION 7: MONITORING START / STOP
// ============================================================

function startMonitoring() {
  if (!sensorReady) {
    alert('Please enable sensors first.');
    return;
  }

  monitoring = true;

  // Update UI
  document.getElementById('monitor-state').textContent = 'Active';
  document.getElementById('monitor-state').className   = 'monitor-state active';
  document.getElementById('monitor-icon').className    = 'monitor-icon active';
  document.getElementById('status-dot').className      = 'status-dot active';
  document.getElementById('status-label').textContent  = 'Monitoring';

  // Show Stop button, hide Start
  document.getElementById('btn-start').style.display   = 'none';
  document.getElementById('btn-stop').style.display    = 'block';
  document.getElementById('btn-sensor').style.display  = 'none';
}

function stopMonitoring() {
  monitoring = false;

  // Reset UI
  document.getElementById('monitor-state').textContent = 'Not Active';
  document.getElementById('monitor-state').className   = 'monitor-state';
  document.getElementById('monitor-icon').className    = 'monitor-icon';
  document.getElementById('status-dot').className      = 'status-dot';
  document.getElementById('status-label').textContent  = 'Standby';

  // Show Start button, hide Stop
  document.getElementById('btn-start').style.display   = 'flex';
  document.getElementById('btn-stop').style.display    = 'none';
  document.getElementById('btn-sensor').style.display  = 'flex';
}


// ============================================================
// SECTION 8: CRASH ALERT POPUP
// ============================================================

function triggerCrashAlert(gForce) {
  // Pause monitoring while alert is open
  stopMonitoring();

  // Show alert modal
  document.getElementById('modal-alert').style.display = 'flex';

  // Reset countdown
  countdown = 30;
  updateCountdownUI(30);

  // Total circumference of the SVG circle (2 * π * r = 2 * 3.14159 * 44 ≈ 276.5)
  const circumference = 276.5;
  const ring = document.getElementById('cd-fill');
  ring.style.strokeDashoffset = 0;

  // Tick every second
  crashTimer = setInterval(() => {
    countdown--;
    updateCountdownUI(countdown);

    // Animate the ring draining
    const offset = circumference * (1 - countdown / 30);
    ring.style.strokeDashoffset = offset;

    // Time's up — send alert automatically
    if (countdown <= 0) {
      clearInterval(crashTimer);
      crashTimer = null;
      sendEmergencyAlert(gForce, 'AUTO');
    }
  }, 1000);
}

// Update the numbers inside the countdown circle
function updateCountdownUI(sec) {
  document.getElementById('countdown-num').textContent  = sec;
  document.getElementById('cd-sec-text').textContent    = sec;
}

// User tapped "I'm Safe"
function iAmSafe() {
  clearInterval(crashTimer);
  crashTimer = null;
  document.getElementById('modal-alert').style.display = 'none';
  startMonitoring();  // Resume monitoring
}

// User tapped "Send Alert Now"
function sendNow() {
  clearInterval(crashTimer);
  crashTimer = null;
  const mag = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
  sendEmergencyAlert(mag / 9.8, 'MANUAL');
}


// ============================================================
// SECTION 9: SEND EMERGENCY ALERT
// Gets GPS → saves to Firebase → shows confirmation
// ============================================================

async function sendEmergencyAlert(gForce, type) {
  // Close alert modal
  document.getElementById('modal-alert').style.display = 'none';

  // 1. Try to get GPS coordinates
  let lat = 'Unknown', lng = 'Unknown';
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 })
    );
    lat = pos.coords.latitude.toFixed(6);
    lng = pos.coords.longitude.toFixed(6);
    document.getElementById('stat-gps').textContent = 'Got GPS ✓';
  } catch (e) {
    document.getElementById('stat-gps').textContent = 'No GPS';
  }

  // 2. Build alert record
  const timestamp = new Date().toLocaleString('en-IN');
  const gVal      = typeof gForce === 'number' ? gForce.toFixed(2) : '—';

  const alertData = {
    user:        userData.name,
    contactName: userData.contactName,
    contactNum:  userData.contactNum,
    timestamp,
    lat, lng,
    gForce:      gVal,
    type,
    mapsLink:    lat !== 'Unknown' ? `https://maps.google.com/?q=${lat},${lng}` : 'N/A'
  };

  // 3. Save to Firebase Firestore
  try {
    await window.CG_addDoc(
      window.CG_collection(window.CG_DB, 'crash_alerts'),
      alertData
    );
  } catch (err) {
    console.error('Firestore save error:', err);
  }

  // 4. Add to local crash log
  if (window.CG_appendLogItem) {
    window.CG_appendLogItem(alertData);
  }

  // 5. Update alert count
  alertCount++;
  document.getElementById('stat-alerts').textContent = alertCount;
  const logCount = document.getElementById('log-count');
  logCount.textContent = `${alertCount} incident${alertCount !== 1 ? 's' : ''}`;

  // 6. Show "Alert Sent" confirmation modal
  document.getElementById('sent-details').innerHTML = `
    <strong>Name:</strong> ${userData.name}<br>
    <strong>Contact:</strong> ${userData.contactName} · ${userData.contactNum}<br>
    <strong>Time:</strong> ${timestamp}<br>
    <strong>Impact:</strong> ${gVal}G<br>
    <strong>Location:</strong> ${lat !== 'Unknown' ? lat + ', ' + lng : 'Unavailable'}<br>
    <strong>Saved to Firebase:</strong> ✓
  `;
  document.getElementById('modal-sent').style.display = 'flex';
}

// Close the "Alert Sent" modal and resume monitoring
function closeSentModal() {
  document.getElementById('modal-sent').style.display = 'none';
  startMonitoring();
}


// ============================================================
// SECTION 10: EMERGENCY ASSISTANCE SCREEN
// ============================================================

// Stores current lat/lng for map links
let currentLat = null;
let currentLng = null;

// Which tab is active: 'hospital' or 'police'
let activeTab = 'hospital';

// Cache results so we don't re-fetch on tab switch
let nearbyCache = { hospital: null, police: null };


// Called when user taps "Get Emergency Help" on sent modal
function goToEmergencyScreen() {
  document.getElementById('modal-sent').style.display = 'none';
  showScreen('screen-emergency');
  initEmergencyScreen();
}

// Initialize emergency screen: get GPS + fetch nearby
function initEmergencyScreen() {
  // Reset cache
  nearbyCache = { hospital: null, police: null };

  // Get GPS location
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;

      // Show coordinates
      document.getElementById('location-coords').textContent =
        `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`;

      // Enable Maps button
      const mapsBtn = document.getElementById('btn-maps');
      mapsBtn.disabled = false;

      // Fetch nearby hospitals first
      fetchNearbyPlaces();
    },
    (err) => {
      document.getElementById('location-coords').textContent = 'Location unavailable';
      showNearbyError();
    },
    { timeout: 8000 }
  );
}

// Open Google Maps at current location
function openMaps() {
  if (!currentLat) return;
  window.open(`https://maps.google.com/?q=${currentLat},${currentLng}`, '_blank');
}

// Share location via Web Share API (or fallback copy)
function shareLocation() {
  if (!currentLat) {
    alert('Location not available yet.');
    return;
  }
  const url = `https://maps.google.com/?q=${currentLat},${currentLng}`;
  const text = `🚨 Emergency! I need help. My location: ${url}`;

  if (navigator.share) {
    navigator.share({ title: 'Emergency Location', text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Location link copied! Paste it in WhatsApp or SMS.');
    });
  }
}

// Switch between Hospital / Police tabs
function switchTab(type, btnEl) {
  activeTab = type;

  // Update tab button styles
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');

  // Show cached results if available
  if (nearbyCache[type]) {
    renderNearbyList(nearbyCache[type], type);
  } else {
    fetchNearbyPlaces();
  }
}

// Fetch nearby places using OpenStreetMap Overpass API (FREE, no key needed)
async function fetchNearbyPlaces() {
  if (!currentLat || !currentLng) return;

  showNearbyLoading();

  // Overpass query — searches within 5km radius
  const radius = 5000;
  const tag = activeTab === 'hospital'
    ? 'amenity=hospital'
    : 'amenity=police';

  const query = `
    [out:json][timeout:10];
    (
      node[${tag}](around:${radius},${currentLat},${currentLng});
      way[${tag}](around:${radius},${currentLat},${currentLng});
    );
    out center 8;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });

    if (!res.ok) throw new Error('API error');

    const data = await res.json();
    const places = parsePlaces(data.elements);

    // Cache results
    nearbyCache[activeTab] = places;

    renderNearbyList(places, activeTab);

  } catch (err) {
    console.error('Overpass error:', err);
    showNearbyError();
  }
}

// Parse Overpass API response into clean objects
function parsePlaces(elements) {
  return elements
    .map(el => {
      // Get lat/lng (nodes have direct, ways have center)
      const lat = el.lat || (el.center && el.center.lat);
      const lng = el.lon || (el.center && el.center.lon);
      if (!lat || !lng) return null;

      const name = el.tags?.name || el.tags?.['name:en'] || 'Unnamed';
      const dist = getDistanceKm(currentLat, currentLng, lat, lng);

      return { name, lat, lng, dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)  // Sort closest first
    .slice(0, 6);                      // Max 6 results
}

// Haversine formula — calculates distance between two GPS coords in km
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Render the list of nearby places into DOM
function renderNearbyList(places, type) {
  const list = document.getElementById('nearby-list');
  const icon = type === 'hospital' ? '🏥' : '👮';
  const iconClass = type === 'hospital' ? 'hospital' : 'police';

  document.getElementById('nearby-loading').style.display = 'none';
  document.getElementById('nearby-error').style.display   = 'none';
  list.style.display = 'block';

  if (!places || places.length === 0) {
    list.innerHTML = `<p class="log-empty">No ${type === 'hospital' ? 'hospitals' : 'police stations'} found within 5km.</p>`;
    return;
  }

  list.innerHTML = places.map(p => `
    <div class="nearby-item">
      <div class="nearby-item-icon ${iconClass}">${icon}</div>
      <div class="nearby-item-info">
        <div class="nearby-item-name">${p.name}</div>
        <div class="nearby-item-dist">📍 ${p.dist < 1
          ? Math.round(p.dist * 1000) + ' m away'
          : p.dist.toFixed(1) + ' km away'
        }</div>
      </div>
      <a class="btn-directions"
         href="https://maps.google.com/maps?daddr=${p.lat},${p.lng}"
         target="_blank">
        Directions
      </a>
    </div>
  `).join('');
}

// Show loading state
function showNearbyLoading() {
  document.getElementById('nearby-loading').style.display = 'flex';
  document.getElementById('nearby-error').style.display   = 'none';
  document.getElementById('nearby-list').style.display    = 'none';
}

// Show error state
function showNearbyError() {
  document.getElementById('nearby-loading').style.display = 'none';
  document.getElementById('nearby-error').style.display   = 'block';
  document.getElementById('nearby-list').style.display    = 'none';
}

// Back to dashboard from emergency screen
function closeSentModal() {
  document.getElementById('modal-sent').style.display = 'none';
  showScreen('screen-dashboard');
  startMonitoring();
}
