// ============================================================
// app.js — CrashGuard Main Application Logic v2.0
// ============================================================

// ============================================================
// SECTION 1: APP STATE
// ============================================================

let userData    = {};       // { name, contacts: [{name, num}] }
let monitoring  = false;
let sensorReady = false;
let crashTimer  = null;
let countdown   = 10;       // 10 second countdown

let accel = { x: 0, y: 0, z: 0 };

const CRASH_THRESHOLD = 24.5;  // 2.5G in m/s²
const WARN_THRESHOLD  = 14.7;  // 1.5G pre-impact warning

let alertCount   = 0;
let warningActive = false;


// ============================================================
// SECTION 2: SCREEN NAVIGATION
// ============================================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  window.scrollTo(0, 0);

  // Auto-init emergency screen when navigated to
  if (screenId === 'screen-emergency') {
    initEmergencyScreen();
  }

  // Update car monitor when navigated to
  if (screenId === 'screen-car-monitor') {
    updateCarMonitor();
  }
}


// ============================================================
// SECTION 3: SETUP SCREEN — MULTIPLE CONTACTS
// ============================================================

// Dynamic contacts list in setup
let setupContacts = [];

function addContactRow() {
  const idx = setupContacts.length;
  setupContacts.push({ name: '', num: '' });
  renderSetupContacts();
}

function removeContactRow(idx) {
  if (setupContacts.length <= 1) {
    alert('At least one emergency contact is required.');
    return;
  }
  setupContacts.splice(idx, 1);
  renderSetupContacts();
}

function renderSetupContacts() {
  const container = document.getElementById('contacts-container');
  container.innerHTML = setupContacts.map((c, idx) => `
    <div class="contact-row-setup" id="contact-row-${idx}">
      <div class="contact-row-header">
        <span class="contact-row-label">Contact ${idx + 1}</span>
        ${setupContacts.length > 1
          ? `<button class="btn-remove-contact" onclick="removeContactRow(${idx})">✕ Remove</button>`
          : ''}
      </div>
      <div class="field-group" style="margin-bottom:10px">
        <label class="field-label">Name</label>
        <input class="field-input" type="text" placeholder="e.g. Ammi, Bhai, Friend"
          value="${c.name}"
          oninput="setupContacts[${idx}].name = this.value" />
      </div>
      <div class="field-group" style="margin-bottom:0">
        <label class="field-label">Phone Number</label>
        <input class="field-input" type="tel" placeholder="+91 98765 43210"
          value="${c.num}"
          oninput="setupContacts[${idx}].num = this.value" />
      </div>
    </div>
  `).join('');
}

function handleSetup() {
  const name = document.getElementById('inp-name').value.trim();

  if (!name) {
    alert('Please enter your full name.');
    return;
  }

  // Re-read contact values from DOM before validating
  const contactInputs = document.querySelectorAll('#contacts-container .contact-row-setup');
  const contacts = [];

  contactInputs.forEach((row, idx) => {
    const inputs = row.querySelectorAll('input');
    const cName = inputs[0].value.trim();
    const cNum  = inputs[1].value.trim();
    if (cName && cNum) {
      contacts.push({ name: cName, num: cNum });
    }
  });

  if (contacts.length === 0) {
    alert('Please add at least one emergency contact.');
    return;
  }

  userData = { name, contacts };
  localStorage.setItem('cg_user', JSON.stringify(userData));

  applyUserToUI();
  showScreen('screen-dashboard');
}

function applyUserToUI() {
  document.getElementById('greeting-name').textContent = `Hello, ${userData.name.split(' ')[0]}.`;
  renderContactsOnDashboard();
}

function renderContactsOnDashboard() {
  const list = document.getElementById('contacts-list');
  if (!list || !userData.contacts) return;

  list.innerHTML = userData.contacts.map((c, idx) => `
    <div class="contact-row">
      <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <p class="contact-name">${c.name}</p>
        <p class="contact-num">${c.num}</p>
      </div>
    </div>
  `).join('');
}

function editContact() {
  // Pre-fill setup form
  document.getElementById('inp-name').value = userData.name;
  setupContacts = userData.contacts ? [...userData.contacts] : [{ name: '', num: '' }];
  renderSetupContacts();
  showScreen('screen-setup');
}


// ============================================================
// SECTION 4: AUTO-LOGIN
// ============================================================

window.addEventListener('load', () => {
  // Init setup with one empty contact row
  setupContacts = [{ name: '', num: '' }];
  renderSetupContacts();

  const saved = localStorage.getItem('cg_user');
  if (saved) {
    userData = JSON.parse(saved);

    // Migrate old single-contact format
    if (userData.contactName && !userData.contacts) {
      userData.contacts = [{ name: userData.contactName, num: userData.contactNum }];
      delete userData.contactName;
      delete userData.contactNum;
      localStorage.setItem('cg_user', JSON.stringify(userData));
    }

    applyUserToUI();
    showScreen('screen-dashboard');
  }

  // Request notification permission
  requestNotificationPermission();
});


// ============================================================
// SECTION 5: PUSH NOTIFICATIONS
// ============================================================

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: 'https://raw.githubusercontent.com/sayyedasgar7-arch/crash-notifier/main/icon.png',
      badge: 'https://raw.githubusercontent.com/sayyedasgar7-arch/crash-notifier/main/icon.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true
    });
  }
}


// ============================================================
// SECTION 6: SENSOR PERMISSION
// ============================================================

function requestSensor() {
  if (typeof DeviceMotionEvent === 'undefined') {
    alert('Motion sensors not supported. Open this app on a mobile phone.');
    return;
  }

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(result => {
        if (result === 'granted') activateSensor();
        else alert('Sensor permission denied. Cannot detect crashes without motion access.');
      })
      .catch(err => console.error('Sensor permission error:', err));
  } else {
    activateSensor();
  }
}

function activateSensor() {
  sensorReady = true;

  document.getElementById('sensor-card').style.display   = 'block';
  document.getElementById('sensor-notice').style.display = 'none';
  document.getElementById('btn-start').disabled          = false;

  window.addEventListener('devicemotion', handleMotion);

  document.getElementById('btn-sensor').textContent    = '✓ Sensors Active';
  document.getElementById('btn-sensor').style.color    = 'var(--green)';
  document.getElementById('btn-sensor').style.borderColor = 'var(--green)';
  document.getElementById('btn-sensor').disabled       = true;
}


// ============================================================
// SECTION 7: MOTION EVENT + PRE-IMPACT WARNING
// ============================================================

function handleMotion(event) {
  if (!monitoring) return;

  const a = event.accelerationIncludingGravity || event.acceleration;
  if (!a) return;

  accel.x = a.x || 0;
  accel.y = a.y || 0;
  accel.z = a.z || 0;

  document.getElementById('val-x').textContent = Math.abs(accel.x).toFixed(2);
  document.getElementById('val-y').textContent = Math.abs(accel.y).toFixed(2);
  document.getElementById('val-z').textContent = Math.abs(accel.z).toFixed(2);

  const magnitude = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
  const gForce    = magnitude / 9.8;

  document.getElementById('stat-gforce').textContent = gForce.toFixed(2) + ' G';

  // Update impact bar
  const barPct = Math.min((magnitude / (CRASH_THRESHOLD * 1.4)) * 100, 100);
  const bar = document.getElementById('impact-bar');
  bar.style.width = barPct + '%';
  bar.classList.remove('warn', 'danger');
  if (gForce > 2.5)      bar.classList.add('danger');
  else if (gForce > 1.5) bar.classList.add('warn');

  document.getElementById('val-z').classList.toggle('danger', Math.abs(accel.z) > 20);

  // Update car monitor if active
  const carScreen = document.getElementById('screen-car-monitor');
  if (carScreen && carScreen.classList.contains('active')) {
    document.getElementById('car-gforce').textContent = gForce.toFixed(2) + 'G';
    const carBar = document.getElementById('car-impact-bar');
    if (carBar) {
      carBar.style.width = barPct + '%';
      carBar.className = 'car-impact-fill' + (gForce > 2.5 ? ' danger' : gForce > 1.5 ? ' warn' : '');
    }
  }

  // ---- PRE-IMPACT WARNING (1.5G) ----
  const warning = document.getElementById('pre-impact-warning');
  if (warning) {
    if (gForce >= 1.5 && gForce < 2.5 && !warningActive) {
      warningActive = true;
      warning.style.display = 'flex';
      warning.classList.add('pulse');
      sendNotification('⚠️ High Impact Detected', `G-Force: ${gForce.toFixed(2)}G — Possible rough impact. Stay alert!`);
    } else if (gForce < 1.5) {
      warningActive = false;
      warning.style.display = 'none';
      warning.classList.remove('pulse');
    }
  }

  // ---- CRASH DETECTION (2.5G) ----
  if (magnitude > CRASH_THRESHOLD && !crashTimer) {
    triggerCrashAlert(gForce);
  }
}


// ============================================================
// SECTION 8: MONITORING START / STOP
// ============================================================

function startMonitoring() {
  if (!sensorReady) {
    alert('Please enable sensors first.');
    return;
  }

  monitoring = true;

  document.getElementById('monitor-state').textContent = 'Active';
  document.getElementById('monitor-state').className   = 'monitor-state active';
  document.getElementById('monitor-icon').className    = 'monitor-icon active';
  document.getElementById('status-dot').className      = 'status-dot active';
  document.getElementById('status-label').textContent  = 'Monitoring';

  document.getElementById('btn-start').style.display  = 'none';
  document.getElementById('btn-stop').style.display   = 'block';
  document.getElementById('btn-sensor').style.display = 'none';

  // Update car monitor status
  const carStatus = document.getElementById('car-status');
  if (carStatus) carStatus.textContent = '● Active';
}

function stopMonitoring() {
  monitoring = false;
  warningActive = false;

  const warning = document.getElementById('pre-impact-warning');
  if (warning) warning.style.display = 'none';

  document.getElementById('monitor-state').textContent = 'Not Active';
  document.getElementById('monitor-state').className   = 'monitor-state';
  document.getElementById('monitor-icon').className    = 'monitor-icon';
  document.getElementById('status-dot').className      = 'status-dot';
  document.getElementById('status-label').textContent  = 'Standby';

  document.getElementById('btn-start').style.display  = 'flex';
  document.getElementById('btn-stop').style.display   = 'none';
  document.getElementById('btn-sensor').style.display = 'flex';

  const carStatus = document.getElementById('car-status');
  if (carStatus) carStatus.textContent = '● Standby';
}


// ============================================================
// SECTION 9: CRASH ALERT POPUP — 10 SECOND COUNTDOWN
// ============================================================

function triggerCrashAlert(gForce) {
  stopMonitoring();

  // Send push notification immediately
  sendNotification('🚨 CRASH DETECTED!', `Impact: ${gForce.toFixed(2)}G — Emergency alert in 10 seconds if no response.`);

  document.getElementById('modal-alert').style.display = 'flex';

  countdown = 10;
  updateCountdownUI(10);

  const circumference = 276.5;
  const ring = document.getElementById('cd-fill');
  ring.style.strokeDashoffset = 0;

  crashTimer = setInterval(() => {
    countdown--;
    updateCountdownUI(countdown);

    // Ring drains over 10 seconds
    const offset = circumference * (1 - countdown / 10);
    ring.style.strokeDashoffset = offset;

    if (countdown <= 0) {
      clearInterval(crashTimer);
      crashTimer = null;
      sendEmergencyAlert(gForce, 'AUTO');
    }
  }, 1000);
}

function updateCountdownUI(sec) {
  document.getElementById('countdown-num').textContent = sec;
  document.getElementById('cd-sec-text').textContent   = sec;
}

function iAmSafe() {
  clearInterval(crashTimer);
  crashTimer = null;
  document.getElementById('modal-alert').style.display = 'none';
  startMonitoring();
}

function sendNow() {
  clearInterval(crashTimer);
  crashTimer = null;
  const mag = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
  sendEmergencyAlert(mag / 9.8, 'MANUAL');
}


// ============================================================
// SECTION 10: SEND EMERGENCY ALERT — ALL CONTACTS
// ============================================================

async function sendEmergencyAlert(gForce, type) {
  document.getElementById('modal-alert').style.display = 'none';

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

  const timestamp = new Date().toLocaleString('en-IN');
  const gVal      = typeof gForce === 'number' ? gForce.toFixed(2) : '—';
  const contacts  = userData.contacts || [];

  const alertData = {
    user:      userData.name,
    contacts:  contacts,
    timestamp,
    lat, lng,
    gForce:    gVal,
    type,
    mapsLink:  lat !== 'Unknown' ? `https://maps.google.com/?q=${lat},${lng}` : 'N/A'
  };

  // Save to Firebase
  try {
    await window.CG_addDoc(
      window.CG_collection(window.CG_DB, 'crash_alerts'),
      alertData
    );
  } catch (err) {
    console.error('Firestore save error:', err);
  }

  if (window.CG_appendLogItem) {
    window.CG_appendLogItem(alertData);
  }

  alertCount++;
  document.getElementById('stat-alerts').textContent = alertCount;
  document.getElementById('log-count').textContent = `${alertCount} incident${alertCount !== 1 ? 's' : ''}`;

  // Build contacts list for modal
  const contactsHTML = contacts.map(c =>
    `<strong>${c.name}</strong> · ${c.num}`
  ).join('<br>');

  document.getElementById('sent-details').innerHTML = `
    <strong>Name:</strong> ${userData.name}<br>
    <strong>Alert sent to:</strong><br>${contactsHTML}<br>
    <strong>Time:</strong> ${timestamp}<br>
    <strong>Impact:</strong> ${gVal}G<br>
    <strong>Location:</strong> ${lat !== 'Unknown' ? lat + ', ' + lng : 'Unavailable'}<br>
    <strong>Saved to Firebase:</strong> ✓
  `;
  document.getElementById('modal-sent').style.display = 'flex';

  // Send notification
  sendNotification('🚨 Alert Sent', `Emergency alert sent to ${contacts.length} contact(s). Impact: ${gVal}G`);
}

function closeSentModal() {
  document.getElementById('modal-sent').style.display = 'none';
  showScreen('screen-dashboard');
  startMonitoring();
}


// ============================================================
// SECTION 11: CAR MONITOR MODE
// ============================================================

function updateCarMonitor() {
  const status = document.getElementById('car-status');
  if (status) {
    status.textContent = monitoring ? '● Active' : '● Standby';
  }

  const name = document.getElementById('car-username');
  if (name && userData.name) {
    name.textContent = userData.name.split(' ')[0];
  }
}

function toggleMonitoringFromCar() {
  if (monitoring) {
    stopMonitoring();
  } else {
    startMonitoring();
  }
  updateCarMonitor();
}


// ============================================================
// SECTION 12: EMERGENCY ASSISTANCE SCREEN
// ============================================================

let currentLat = null;
let currentLng = null;
let activeTab  = 'hospital';
let nearbyCache = { hospital: null, police: null };

function goToEmergencyScreen() {
  document.getElementById('modal-sent').style.display = 'none';
  showScreen('screen-emergency');
}

function initEmergencyScreen() {
  nearbyCache = { hospital: null, police: null };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;

      document.getElementById('location-coords').textContent =
        `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`;

      document.getElementById('btn-maps').disabled = false;
      fetchNearbyPlaces();
    },
    (err) => {
      document.getElementById('location-coords').textContent = 'Location unavailable';
      showNearbyError();
    },
    { timeout: 8000 }
  );
}

function openMaps() {
  if (!currentLat) return;
  window.open(`https://maps.google.com/?q=${currentLat},${currentLng}`, '_blank');
}

function shareLocation() {
  if (!currentLat) {
    alert('Location not available yet.');
    return;
  }
  const url  = `https://maps.google.com/?q=${currentLat},${currentLng}`;
  const text = `🚨 Emergency! I need help. My location: ${url}`;

  if (navigator.share) {
    navigator.share({ title: 'Emergency Location', text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Location link copied! Paste it in WhatsApp or SMS.');
    });
  }
}

function switchTab(type, btnEl) {
  activeTab = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');

  if (nearbyCache[type]) {
    renderNearbyList(nearbyCache[type], type);
  } else {
    fetchNearbyPlaces();
  }
}

async function fetchNearbyPlaces() {
  if (!currentLat || !currentLng) return;

  showNearbyLoading();

  const radius = 5000;
  const tag    = activeTab === 'hospital' ? 'amenity=hospital' : 'amenity=police';

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

    const data   = await res.json();
    const places = parsePlaces(data.elements);

    nearbyCache[activeTab] = places;
    renderNearbyList(places, activeTab);

  } catch (err) {
    console.error('Overpass error:', err);
    showNearbyError();
  }
}

function parsePlaces(elements) {
  return elements
    .map(el => {
      const lat = el.lat || (el.center && el.center.lat);
      const lng = el.lon || (el.center && el.center.lon);
      if (!lat || !lng) return null;

      const name = el.tags?.name || el.tags?.['name:en'] || 'Unnamed';
      const dist = getDistanceKm(currentLat, currentLng, lat, lng);
      return { name, lat, lng, dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderNearbyList(places, type) {
  const list      = document.getElementById('nearby-list');
  const icon      = type === 'hospital' ? '🏥' : '👮';
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

function showNearbyLoading() {
  document.getElementById('nearby-loading').style.display = 'flex';
  document.getElementById('nearby-error').style.display   = 'none';
  document.getElementById('nearby-list').style.display    = 'none';
}

function showNearbyError() {
  document.getElementById('nearby-loading').style.display = 'none';
  document.getElementById('nearby-error').style.display   = 'block';
  document.getElementById('nearby-list').style.display    = 'none';
}
