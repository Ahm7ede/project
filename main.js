// Supabase configuration
const SUPABASE_URL = 'https://ikbwdlfjsxglfmydupsk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYndkbGZqc3hnbGZteWR1cHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5MDg1NTUsImV4cCI6MjA1NjQ4NDU1NX0.NCc_38naVWc-JHO1qkcXdBU1BEqeZJfuxMrQwg07dD0';

// App state
let supabase;
let map;
let currentFloor = 0;
let currentCategory = null;
let allPoints = [];
let markerLayers = {};
let categoryButtons = {};
let visibleMarkers = [];
let selectedLobbies = [];
let pathLine = null;
let currentDestination = null;

// Map settings
const CAMPUS_CENTER = [9.993604235, 76.35831674];
const CAMPUS_ZOOM = 19;
const MAX_ZOOM = 22;
const LABEL_ZOOM_LEVEL = 21; // Zoom level at which labels appear

function createMarker(point) {
  const marker = L.circleMarker([point.latitude, point.longitude], {
    radius: 5,
    fillColor: getCategoryColor(point.type),
    color: '#fff',
    weight: 1,
    opacity: 1,
    fillOpacity: 0.8
  });

  marker.bindPopup(`
    <div class="point-popup">
      <h3>${point.name || 'Unnamed Point'}</h3>
      <p>Category: ${point.type || 'None'}</p>
      <p>Floor: ${point.floor || 'N/A'}</p>
      <p>Location: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</p>
      <button class="direction-btn" onclick="handleGetDirection(${point.id})">Get Direction</button>
    </div>
  `);

  marker.pointData = point;
  marker.floor = point.floor;
  marker.category = point.type || 'uncategorized';

  if (point.type === 'lobby') {
    marker.on('click', () => handleLobbyClick(point));
  }

  createLabelForMarker(marker);
  return marker;
}

function handleLobbyClick(lobby) {
  if (selectedLobbies.length === 2) {
    selectedLobbies = [];
    if (pathLine) {
      map.removeLayer(pathLine);
      pathLine = null;
    }
  }
  selectedLobbies.push(lobby);
  if (selectedLobbies.length === 2) {
    drawPathBetweenLobbies(selectedLobbies[0], selectedLobbies[1]);
  }
}

function drawPathBetweenLobbies(start, end) {
  if (start.floor !== end.floor) {
    alert("Selected lobbies are on different floors.");
    return;
  }

  const pathCoords = [
    [start.latitude, start.longitude],
    [end.latitude, end.longitude]
  ];

  if (pathLine) map.removeLayer(pathLine);

  pathLine = L.polyline(pathCoords, {
    color: 'blue',
    weight: 4,
    opacity: 0.8,
    dashArray: '5, 10'
  }).addTo(map);

  map.fitBounds(pathLine.getBounds(), { padding: [50, 50] });
}

async function handleGetDirection(destinationId) {
  const destination = allPoints.find(p => p.id === destinationId);
  if (!destination) return alert("Destination not found.");
  currentDestination = destination;

  const modal = document.createElement('div');
  modal.className = 'direction-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Select Current Location</h2>
      <input type="text" placeholder="Enter location name..." id="manualLocationInput">
      <button id="scanQRBtn">Scan QR Code</button>
      <button id="submitManualBtn">Use this location</button>
      <button id="closeModalBtn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeModalBtn').onclick = () => modal.remove();
  document.getElementById('submitManualBtn').onclick = () => {
    const name = document.getElementById('manualLocationInput').value.trim().toLowerCase();
    const current = allPoints.find(p => p.name?.toLowerCase() === name);
    if (current) {
      drawPathBetweenLobbies(current, currentDestination);
      modal.remove();
    } else {
      alert("Location not found. Please try again.");
    }
  };

  document.getElementById('scanQRBtn').onclick = () => {
    modal.remove();
    startQRScanner(currentDestination);
  };
}

function startQRScanner(destination) {
  const qrContainer = document.createElement('div');
  qrContainer.id = 'qr-reader';
  document.body.appendChild(qrContainer);

  const html5QrCode = new Html5Qrcode("qr-reader");

  html5QrCode.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: 250
    },
    qrText => {
      html5QrCode.stop();
      document.getElementById('qr-reader').remove();

      const current = allPoints.find(p => p.name?.toLowerCase() === qrText.toLowerCase());
      if (current) {
        drawPathBetweenLobbies(current, destination);
      } else {
        alert("Location not found in QR. Try again.");
      }
    },
    error => {}
  ).catch(err => {
    alert("Failed to start QR Scanner: " + err);
  });
}
