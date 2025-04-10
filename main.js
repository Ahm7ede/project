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

// Map settings
const CAMPUS_CENTER = [9.993604235, 76.35831674];
const CAMPUS_ZOOM = 19;
const MAX_ZOOM = 22;
const LABEL_ZOOM_LEVEL = 21; // Zoom level at which labels appear

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeSplashScreen();
  initializeSupabase();
  initializeMap();
  initializeUI();
});

function initializeSplashScreen() {
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    document.getElementById('app').style.opacity = '1';
    
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
    }, 1000);
  }, 2000);
  
  setTimeout(() => {
    document.getElementById('splash').style.display = 'none';
    document.getElementById('app').style.opacity = '1';
  }, 3500);
  
  setTimeout(() => {
    document.getElementById('poiPanel').classList.add('expanded');
  }, 3000);
}

function initializeSupabase() {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error('Error initializing Supabase:', error);
  }
}

function initializeMap() {
  map = L.map('map', {
    center: CAMPUS_CENTER,
    zoom: CAMPUS_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomSnap: 0.5,
    zoomDelta: 0.5
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: MAX_ZOOM,
    maxNativeZoom: 19,
    noWrap: true,
  }).addTo(map);

  map.whenReady(() => {
    if (currentFloor === 0) {
      focusOnEntrance();
    }
    fetchPoints();
  });

  map.on('zoomend', updateAllLabels);
  map.on('moveend', updateAllLabels);
  map.on('move', updateAllLabels);

  document.querySelector(`.floor-button[data-floor="${currentFloor}"]`).classList.add('active');
}

function focusOnEntrance() {
  if (currentFloor !== 0) return;
  
  const entrancePoint = {
    latitude: 9.993604235,
    longitude: 76.35831674,
    floor: 0,
    type: 'entrance',
    name: 'mbentrance'
  };

  map.flyTo([entrancePoint.latitude, entrancePoint.longitude], CAMPUS_ZOOM, {
    duration: 1,
    easeLinearity: 0.25
  });

  createEntranceMarker(entrancePoint);
}

function createEntranceMarker(point) {
  if (currentFloor !== 0) return;

  if (window.entranceMarker && map.hasLayer(window.entranceMarker)) {
    map.removeLayer(window.entranceMarker);
  }

  const entranceIcon = L.divIcon({
    className: 'entrance-marker-icon',
    html: '<div class="entrance-pin"><div class="entrance-pin-inner"></div></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
  
  window.entranceMarker = L.marker([point.latitude, point.longitude], {
    icon: entranceIcon,
    zIndexOffset: 1000
  }).addTo(map);
  
  window.entranceMarker.getElement().classList.add('pulsing');
  
  window.entranceMarker.bindPopup(`
    <div class="entrance-popup">
      <h3>Main Building Entrance</h3>
      <p>You are here</p>
    </div>
  `);
}

function initializeUI() {
  const poiPanel = document.getElementById('poiPanel');
  const poiHandle = document.getElementById('poiHandle');
  poiHandle.addEventListener('click', () => {
    poiPanel.classList.toggle('expanded');
  });
  
  document.querySelectorAll('.floor-button').forEach(button => {
    button.addEventListener('click', async function() {
      document.querySelectorAll('.floor-button').forEach(btn => 
        btn.classList.remove('active')
      );
      this.classList.add('active');
      
      currentFloor = parseInt(this.dataset.floor);
      
      document.getElementById('loadingIndicator').style.display = 'block';
      await fetchFloorPoints(currentFloor);
      document.getElementById('loadingIndicator').style.display = 'none';
    });
  });
  
  document.querySelectorAll('.poi-button').forEach(button => {
    const category = button.dataset.category;
    categoryButtons[category] = button;
    
    button.addEventListener('click', function() {
      currentCategory = currentCategory === category ? null : category;
      
      document.querySelectorAll('.poi-button').forEach(btn => 
        btn.classList.remove('active')
      );
      if (currentCategory) {
        this.classList.add('active');
      }
      
      filterAndDisplayPoints();
    });
  });
  
  document.querySelector('.search-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const searchValue = this.value.trim().toLowerCase();
      if (searchValue) {
        searchPoints(searchValue);
      }
    }
  });
  
  const mapContainer = document.querySelector('.map-container');
  let labelsContainer = document.getElementById('map-labels-container');
  
  if (!labelsContainer) {
    labelsContainer = document.createElement('div');
    labelsContainer.id = 'map-labels-container';
    labelsContainer.style.position = 'absolute';
    labelsContainer.style.top = '0';
    labelsContainer.style.left = '0';
    labelsContainer.style.width = '100%';
    labelsContainer.style.height = '100%';
    labelsContainer.style.pointerEvents = 'none';
    labelsContainer.style.zIndex = '650';
    mapContainer.appendChild(labelsContainer);
  }
}

async function fetchPoints() {
  try {
    document.getElementById('loadingIndicator').style.display = 'block';
    
    const { data, error } = await supabase
      .from('points')
      .select('*')
      .eq('floor', currentFloor);
    
    if (error) throw error;
    
    allPoints = data || [];
    createMarkerLayers();
    filterAndDisplayPoints();
    fitMapToBounds();
    
    if (currentFloor === 0) {
      focusOnEntrance();
    }
    
  } catch (error) {
    console.error('Error fetching points:', error);
    if (!allPoints.length) {
      allPoints = getDemoPoints().filter(p => p.floor === currentFloor);
      createMarkerLayers();
      filterAndDisplayPoints();
      fitMapToBounds();
    }
  } finally {
    document.getElementById('loadingIndicator').style.display = 'none';
  }
}

async function fetchFloorPoints(floor) {
  try {
    if (window.entranceMarker && map.hasLayer(window.entranceMarker)) {
      map.removeLayer(window.entranceMarker);
    }

    const { data, error } = await supabase
      .from('points')
      .select('*')
      .eq('floor', floor);
    
    if (error) throw error;
    
    allPoints = data || [];
    createMarkerLayers();
    filterAndDisplayPoints();
    fitMapToBounds();

    if (floor === 0) {
      const entrancePoint = {
        latitude: 9.993604235,
        longitude: 76.35831674,
        floor: 0,
        type: 'entrance',
        name: 'mbentrance'
      };
      createEntranceMarker(entrancePoint);
    }
    
  } catch (error) {
    console.error(`Error fetching points for floor ${floor}:`, error);
    if (!allPoints.length) {
      allPoints = getDemoPoints().filter(p => p.floor === floor);
      createMarkerLayers();
      filterAndDisplayPoints();
      fitMapToBounds();
    }
  }
}

function updateAllLabels() {
  const currentZoom = map.getZoom();
  const showLabels = currentZoom >= LABEL_ZOOM_LEVEL;
  
  visibleMarkers.forEach(marker => {
    if (marker.label) {
      if (showLabels) {
        marker.label.style.display = 'block';
        updateLabelPosition(marker);
      } else {
        marker.label.style.display = 'none';
      }
    }
  });
}

function updateLabelPosition(marker) {
  if (!marker.label || !marker.getLatLng) return;
  
  const position = map.latLngToContainerPoint(marker.getLatLng());
  marker.label.style.left = `${position.x}px`;
  marker.label.style.top = `${position.y - 15}px`;
  marker.label.style.transform = 'translate(-50%, -100%)';
}

function createMarkerLayers() {
  Object.values(markerLayers).forEach(layer => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  markerLayers = {};
  
  const labelsContainer = document.getElementById('map-labels-container');
  if (labelsContainer) {
    labelsContainer.innerHTML = '';
  }
  
  visibleMarkers = [];
  
  const categories = [...new Set(allPoints.map(p => p.type))];
  
  categories.forEach(category => {
    if (category) {
      markerLayers[category] = L.layerGroup();
    }
  });
  
  markerLayers['uncategorized'] = L.layerGroup();
  
  allPoints.forEach(point => {
    if (!point.latitude || !point.longitude) return;
    
    const marker = createMarker(point);
    
    const layerKey = point.type || 'uncategorized';
    if (markerLayers[layerKey]) {
      markerLayers[layerKey].addLayer(marker);
    } else {
      markerLayers[layerKey] = L.layerGroup([marker]);
    }
    
    point.marker = marker;
  });
}

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
    </div>
  `);
  
  marker.pointData = point;
  marker.floor = point.floor;
  marker.category = point.type || 'uncategorized';
  
  createLabelForMarker(marker);
  
  return marker;
}

function createLabelForMarker(marker) {
  const labelsContainer = document.getElementById('map-labels-container');
  if (!labelsContainer) return;
  
  const point = marker.pointData;
  
  const label = document.createElement('div');
  label.className = 'point-label';
  label.textContent = point.name || 'Unnamed';
  label.style.display = 'none';
  label.style.position = 'absolute';
  
  labelsContainer.appendChild(label);
  marker.label = label;
  
  updateLabelPosition(marker);
  updateAllLabels();
}

function filterAndDisplayPoints() {
  Object.values(markerLayers).forEach(layer => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  
  visibleMarkers = [];
  
  const availableCategories = new Set(allPoints.map(p => p.type).filter(Boolean));
  
  Object.entries(categoryButtons).forEach(([category, button]) => {
    button.disabled = !availableCategories.has(category);
    button.style.opacity = button.disabled ? '0.5' : '1';
  });
  
  if (currentCategory && !availableCategories.has(currentCategory)) {
    currentCategory = null;
    document.querySelectorAll('.poi-button').forEach(btn => btn.classList.remove('active'));
  }
  
  Object.entries(markerLayers).forEach(([category, layer]) => {
    if (!currentCategory || category === currentCategory) {
      map.addLayer(layer);
      layer.eachLayer(marker => {
        visibleMarkers.push(marker);
      });
    }
  });
  
  updateAllLabels();
}

function fitMapToBounds() {
  const floorPoints = allPoints.filter(point => point.floor === currentFloor);
  
  if (floorPoints.length > 0) {
    const latitudes = floorPoints.map(p => p.latitude).filter(Boolean);
    const longitudes = floorPoints.map(p => p.longitude).filter(Boolean);
    
    if (latitudes.length > 0 && longitudes.length > 0) {
      const southWest = L.latLng(
        Math.min(...latitudes) - 0.0005, 
        Math.min(...longitudes) - 0.0005
      );
      const northEast = L.latLng(
        Math.max(...latitudes) + 0.0005, 
        Math.max(...longitudes) + 0.0005
      );
      const bounds = L.latLngBounds(southWest, northEast);
      
      map.fitBounds(bounds);
      return;
    }
  }
  
  map.setView(CAMPUS_CENTER, CAMPUS_ZOOM);
}

function searchPoints(query) {
  const found = allPoints.find(point => 
    (point.name && point.name.toLowerCase().includes(query)) || 
    (point.type && point.type.toLowerCase().includes(query))
  );
  
  if (found) {
    if (found.floor !== currentFloor) {
      currentFloor = found.floor;
      document.querySelectorAll('.floor-button').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.floor) === currentFloor) {
          btn.classList.add('active');
        }
      });
    }
    
    currentCategory = null;
    document.querySelectorAll('.poi-button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    filterAndDisplayPoints();
    map.setView([found.latitude, found.longitude], LABEL_ZOOM_LEVEL + 1);
    
    const highlightMarker = L.circleMarker([found.latitude, found.longitude], {
      radius: 15,
      color: '#3498db',
      weight: 3,
      opacity: 0.8,
      fillColor: '#3498db',
      fillOpacity: 0.3,
      className: 'highlight-marker'
    }).addTo(map);
    
    const markerElement = highlightMarker.getElement();
    if (markerElement) {
      markerElement.style.animation = 'pulse 1.5s infinite';
    }
    
    setTimeout(() => {
      map.removeLayer(highlightMarker);
    }, 3000);
    
    if (found.marker) {
      setTimeout(() => {
        found.marker.openPopup();
      }, 500);
    }
  } else {
    alert(`No location found matching "${query}"`);
  }
}

function getCategoryColor(category) {
  const colors = {
    'elevator': '#e74c3c',
    'canteen': '#f39c12',
    'washroom': '#3498db',
    'library': '#9b59b6',
    'labs': '#2ecc71',
    'default': '#95a5a6'
  };
  
  return colors[category] || colors.default;
}

function getDemoPoints() {
  return [
    { id: 1, floor: 0, name: 'Computer Lab', longitude: 76.3585349, latitude: 9.993269935, type: 'lab' },
    { id: 2, floor: 0, name: 'Physics Lab', longitude: 76.35841714, latitude: 9.99305027, type: 'lab' },
    { id: 3, floor: 0, name: 'Chemistry Lab', longitude: 76.35842629, latitude: 9.992952018, type: 'lab' },
    { id: 4, floor: 0, name: 'Biology Lab', longitude: 76.35832774, latitude: 9.993041686, type: 'lab' }
  ];
}
window.addEventListener('resize', () => {
  if (map) {
    map.invalidateSize();
    updateAllLabels();
  }
});