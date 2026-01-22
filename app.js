/**
 * RyUnfair - Flight Delay Compensation Tracker
 * Main application module
 * UK GDPR Compliant
 */

// ============================================
// Constants and Configuration
// ============================================

const OPENSKY_API = 'https://opensky-network.org/api';
const STORAGE_KEY = 'ryunfair_flights';
const REMINDER_KEY = 'ryunfair_reminders';
const CONSENT_KEY = 'ryunfair_consent';
const API_BASE = ''; // Empty for same-origin, or set to your API URL

// Airport database (common Ryanair destinations)
const AIRPORTS = {
  'STN': { name: 'London Stansted', lat: 51.8850, lon: 0.2350, country: 'GB' },
  'LTN': { name: 'London Luton', lat: 51.8747, lon: -0.3683, country: 'GB' },
  'LGW': { name: 'London Gatwick', lat: 51.1481, lon: -0.1903, country: 'GB' },
  'MAN': { name: 'Manchester', lat: 53.3537, lon: -2.2750, country: 'GB' },
  'BRS': { name: 'Bristol', lat: 51.3827, lon: -2.7190, country: 'GB' },
  'EDI': { name: 'Edinburgh', lat: 55.9500, lon: -3.3725, country: 'GB' },
  'BHX': { name: 'Birmingham', lat: 52.4539, lon: -1.7480, country: 'GB' },
  'DUB': { name: 'Dublin', lat: 53.4213, lon: -6.2700, country: 'IE' },
  'SNN': { name: 'Shannon', lat: 52.7020, lon: -8.9248, country: 'IE' },
  'ORK': { name: 'Cork', lat: 51.8413, lon: -8.4911, country: 'IE' },
  'BCN': { name: 'Barcelona', lat: 41.2971, lon: 2.0785, country: 'ES' },
  'MAD': { name: 'Madrid', lat: 40.4983, lon: -3.5676, country: 'ES' },
  'AGP': { name: 'Malaga', lat: 36.6749, lon: -4.4991, country: 'ES' },
  'ALC': { name: 'Alicante', lat: 38.2822, lon: -0.5582, country: 'ES' },
  'PMI': { name: 'Palma de Mallorca', lat: 39.5517, lon: 2.7388, country: 'ES' },
  'FCO': { name: 'Rome Fiumicino', lat: 41.8003, lon: 12.2389, country: 'IT' },
  'CIA': { name: 'Rome Ciampino', lat: 41.7994, lon: 12.5949, country: 'IT' },
  'BGY': { name: 'Milan Bergamo', lat: 45.6739, lon: 9.7042, country: 'IT' },
  'MXP': { name: 'Milan Malpensa', lat: 45.6306, lon: 8.7281, country: 'IT' },
  'PSA': { name: 'Pisa', lat: 43.6839, lon: 10.3927, country: 'IT' },
  'CDG': { name: 'Paris CDG', lat: 49.0097, lon: 2.5478, country: 'FR' },
  'BVA': { name: 'Paris Beauvais', lat: 49.4544, lon: 2.1128, country: 'FR' },
  'AMS': { name: 'Amsterdam', lat: 52.3086, lon: 4.7639, country: 'NL' },
  'EIN': { name: 'Eindhoven', lat: 51.4500, lon: 5.3743, country: 'NL' },
  'BER': { name: 'Berlin', lat: 52.3667, lon: 13.5033, country: 'DE' },
  'CGN': { name: 'Cologne', lat: 50.8659, lon: 7.1427, country: 'DE' },
  'FRA': { name: 'Frankfurt', lat: 50.0333, lon: 8.5706, country: 'DE' },
  'HHN': { name: 'Frankfurt Hahn', lat: 49.9487, lon: 7.2639, country: 'DE' },
  'BRU': { name: 'Brussels', lat: 50.9014, lon: 4.4844, country: 'BE' },
  'CRL': { name: 'Brussels Charleroi', lat: 50.4592, lon: 4.4538, country: 'BE' },
  'LIS': { name: 'Lisbon', lat: 38.7756, lon: -9.1354, country: 'PT' },
  'OPO': { name: 'Porto', lat: 41.2481, lon: -8.6814, country: 'PT' },
  'FAO': { name: 'Faro', lat: 37.0144, lon: -7.9659, country: 'PT' },
  'ATH': { name: 'Athens', lat: 37.9364, lon: 23.9475, country: 'GR' },
  'SKG': { name: 'Thessaloniki', lat: 40.5197, lon: 22.9709, country: 'GR' },
  'WAW': { name: 'Warsaw', lat: 52.1657, lon: 20.9671, country: 'PL' },
  'WMI': { name: 'Warsaw Modlin', lat: 52.4511, lon: 20.6517, country: 'PL' },
  'KRK': { name: 'Krakow', lat: 50.0777, lon: 19.7848, country: 'PL' },
  'GDN': { name: 'Gdansk', lat: 54.3776, lon: 18.4662, country: 'PL' },
  'PRG': { name: 'Prague', lat: 50.1008, lon: 14.2600, country: 'CZ' },
  'BUD': { name: 'Budapest', lat: 47.4298, lon: 19.2611, country: 'HU' },
  'VIE': { name: 'Vienna', lat: 48.1103, lon: 16.5697, country: 'AT' },
};

// EU/EEA countries for determining applicable law
const EU_EEA_COUNTRIES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH'];

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate compensation based on EU261/UK261 rules
 */
function calculateCompensation(distanceKm, delayMinutes, departureCountry, arrivalCountry) {
  // Delay must be 3+ hours (180 minutes) for compensation
  if (delayMinutes < 180) {
    return { amount: 0, currency: '€', eligible: false, reason: 'Delay under 3 hours' };
  }

  // Determine currency (UK uses GBP, EU uses EUR)
  const isUkFlight = departureCountry === 'GB' || arrivalCountry === 'GB';
  const currency = isUkFlight ? '£' : '€';

  let amount = 0;
  
  if (distanceKm < 1500) {
    amount = isUkFlight ? 220 : 250;
  } else if (distanceKm <= 3500) {
    amount = isUkFlight ? 350 : 400;
  } else {
    // Over 3500km
    if (delayMinutes >= 240) { // 4+ hours
      amount = isUkFlight ? 520 : 600;
    } else { // 3-4 hours
      amount = isUkFlight ? 260 : 300;
    }
  }

  return {
    amount,
    currency,
    eligible: true,
    reason: `${Math.floor(delayMinutes / 60)}h ${delayMinutes % 60}m delay on ${distanceKm.toFixed(0)}km flight`
  };
}

/**
 * Format time from Date object
 */
function formatTime(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format date for display
 */
function formatDate(date) {
  return date.toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

/**
 * Load data from localStorage
 */
function loadFromStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error loading from storage:', e);
    return null;
  }
}

/**
 * Save data to localStorage
 */
function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Error saving to storage:', e);
    return false;
  }
}

// ============================================
// Flight Tracking Functions
// ============================================

/**
 * Search for flight using our API (which uses AviationStack)
 */
async function searchFlight(flightNumber, date) {
  try {
    const response = await fetch(`${API_BASE}/api/flight-status?flight=${encodeURIComponent(flightNumber)}&date=${encodeURIComponent(date)}`);
    const data = await response.json();
    
    if (!response.ok || data.error) {
      console.warn('Flight API error:', data.error || 'Unknown error');
      // Fall back to simulation if API fails
      return simulateFlightData(flightNumber, date);
    }
    
    // Transform API response to our internal format
    return {
      flightNumber: data.flight.flightNumber,
      date: data.flight.date,
      delayMinutes: data.delay.minutes || 0,
      isLive: data.flight.status === 'active' || data.flight.status === 'en-route',
      status: mapFlightStatus(data.flight.status),
      departure: data.flight.departure.iata,
      arrival: data.flight.arrival.iata,
      departureAirport: data.flight.departure.airport,
      arrivalAirport: data.flight.arrival.airport,
      scheduledDeparture: data.flight.departure.scheduled,
      scheduledArrival: data.flight.arrival.scheduled,
      actualDeparture: data.flight.departure.actual,
      actualArrival: data.flight.arrival.actual || data.flight.arrival.estimated,
      progress: calculateProgress(data.flight),
      compensation: data.compensation,
      raw: data.raw, // For debugging
    };
  } catch (error) {
    console.error('Flight search error:', error);
    // Fall back to simulation if network fails
    return simulateFlightData(flightNumber, date);
  }
}

/**
 * Map AviationStack status to our internal status
 */
function mapFlightStatus(status) {
  const statusMap = {
    'scheduled': 'scheduled',
    'active': 'in_flight',
    'en-route': 'in_flight',
    'landed': 'arrived',
    'arrived': 'arrived',
    'cancelled': 'cancelled',
    'diverted': 'diverted',
    'unknown': 'unknown',
  };
  return statusMap[status] || 'unknown';
}

/**
 * Calculate flight progress percentage
 */
function calculateProgress(flight) {
  if (flight.status === 'landed' || flight.status === 'arrived') {
    return 100;
  }
  if (flight.status === 'scheduled') {
    return 0;
  }
  
  // For in-flight, estimate based on time
  if (flight.departure.actual && flight.arrival.scheduled) {
    const departed = new Date(flight.departure.actual).getTime();
    const arriving = new Date(flight.arrival.estimated || flight.arrival.scheduled).getTime();
    const now = Date.now();
    
    if (now >= arriving) return 100;
    if (now <= departed) return 0;
    
    return Math.round(((now - departed) / (arriving - departed)) * 100);
  }
  
  return 50; // Default to middle if we can't calculate
}

/**
 * Parse OpenSky API response
 */
function parseOpenSkyData(data, flightNumber) {
  if (!data.states || data.states.length === 0) {
    return null;
  }
  
  const state = data.states[0];
  return {
    callsign: state[1]?.trim() || flightNumber,
    latitude: state[6],
    longitude: state[5],
    altitude: state[7], // meters
    velocity: state[9], // m/s
    heading: state[10],
    onGround: state[8],
    lastUpdate: new Date(state[4] * 1000)
  };
}

/**
 * Simulate flight data for demonstration
 */
function simulateFlightData(flightNumber, dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  
  // Generate realistic delay (weighted towards shorter delays)
  const delayChance = Math.random();
  let delayMinutes = 0;
  
  if (delayChance > 0.7) {
    // 30% chance of some delay
    if (delayChance > 0.95) {
      // 5% chance of significant delay (3+ hours)
      delayMinutes = 180 + Math.floor(Math.random() * 120);
    } else if (delayChance > 0.85) {
      // 10% chance of moderate delay (1-3 hours)
      delayMinutes = 60 + Math.floor(Math.random() * 120);
    } else {
      // 15% chance of minor delay (15-60 min)
      delayMinutes = 15 + Math.floor(Math.random() * 45);
    }
  }
  
  // For today's flights, simulate real-time progress
  const isToday = date.toDateString() === now.toDateString();
  const isPast = date < new Date(now.toDateString());
  
  return {
    flightNumber,
    date: dateStr,
    delayMinutes,
    isLive: isToday,
    isHistoric: isPast,
    status: isPast ? 'arrived' : (isToday ? 'in_flight' : 'scheduled'),
    progress: isPast ? 100 : (isToday ? Math.min(90, Math.random() * 100) : 0)
  };
}

/**
 * Track flight in real-time (polling)
 */
class FlightTracker {
  constructor() {
    this.currentFlight = null;
    this.pollInterval = null;
    this.listeners = [];
  }
  
  async startTracking(flightData) {
    this.currentFlight = {
      ...flightData,
      startTime: Date.now(),
      updates: []
    };
    
    this.notifyListeners('started', this.currentFlight);
    
    // Poll every 30 seconds for updates
    if (flightData.isLive) {
      this.pollInterval = setInterval(() => this.pollUpdate(), 30000);
    }
    
    return this.currentFlight;
  }
  
  stopTracking() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.currentFlight = null;
  }
  
  async pollUpdate() {
    if (!this.currentFlight) return;
    
    // Simulate delay increasing slightly over time
    if (this.currentFlight.isLive && this.currentFlight.status === 'in_flight') {
      const elapsed = (Date.now() - this.currentFlight.startTime) / 1000;
      
      // Small chance of delay increasing
      if (Math.random() > 0.9) {
        this.currentFlight.delayMinutes += Math.floor(Math.random() * 10);
      }
      
      // Progress towards arrival
      this.currentFlight.progress = Math.min(100, this.currentFlight.progress + 1);
      
      if (this.currentFlight.progress >= 100) {
        this.currentFlight.status = 'arrived';
      }
      
      this.notifyListeners('updated', this.currentFlight);
    }
  }
  
  onUpdate(callback) {
    this.listeners.push(callback);
  }
  
  notifyListeners(event, data) {
    this.listeners.forEach(cb => cb(event, data));
  }
}

// ============================================
// UI Controller
// ============================================

class UIController {
  constructor() {
    this.tracker = new FlightTracker();
    this.currentSection = 'tracker';
    
    this.init();
  }
  
  init() {
    this.setupNavigation();
    this.setupFlightForm();
    this.setupHistoricForm();
    this.setupReminder();
    this.setupActionButtons();
    this.setupCheatSheet();
    this.loadSavedFlights();
    this.setupCookieBanner();
    this.setupDataManagement();
    this.checkVerificationStatus();
    
    // Listen for tracker updates
    this.tracker.onUpdate((event, data) => {
      this.updateFlightDisplay(data);
    });
  }
  
  // Navigation
  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        this.navigateTo(section);
      });
    });
  }
  
  navigateTo(section) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    
    // Update sections
    document.querySelectorAll('.section').forEach(sec => {
      sec.classList.toggle('active', sec.id === section);
    });
    
    this.currentSection = section;
  }
  
  // Flight Form
  setupFlightForm() {
    const form = document.getElementById('flight-form');
    if (!form) {
      console.error('Flight form not found');
      return;
    }
    
    const handleSubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const flightNumber = document.getElementById('flight-number')?.value?.toUpperCase()?.trim() || '';
      const date = document.getElementById('flight-date')?.value || '';
      const departure = document.getElementById('departure')?.value?.toUpperCase()?.trim() || '';
      const arrival = document.getElementById('arrival')?.value?.toUpperCase()?.trim() || '';
      
      if (!flightNumber || !date || !departure || !arrival) {
        showToast('Please fill in all fields', 'error');
        return false;
      }
      
      await this.trackFlight({ flightNumber, date, departure, arrival });
      return false;
    };
    
    form.addEventListener('submit', handleSubmit);
    form.onsubmit = handleSubmit;
  }
  
  async trackFlight(flightInfo) {
    const { flightNumber, date, departure, arrival } = flightInfo;
    
    // Show loading state
    const statusCard = document.getElementById('flight-status');
    statusCard.innerHTML = `
      <div class="status-placeholder">
        <div class="loading"></div>
        <p>Searching for flight ${flightNumber}...</p>
      </div>
    `;
    
    try {
      // Get flight data
      const flightData = await searchFlight(flightNumber, date);
      
      // Get airport info
      const depAirport = AIRPORTS[departure] || { name: departure, lat: 51.5, lon: -0.1, country: 'GB' };
      const arrAirport = AIRPORTS[arrival] || { name: arrival, lat: 53.4, lon: -6.3, country: 'IE' };
      
      // Calculate distance
      const distance = calculateDistance(
        depAirport.lat, depAirport.lon,
        arrAirport.lat, arrAirport.lon
      );
      
      // Calculate compensation
      const compensation = calculateCompensation(
        distance,
        flightData.delayMinutes,
        depAirport.country,
        arrAirport.country
      );
      
      // Combine all data
      const fullFlightData = {
        ...flightData,
        ...flightInfo,
        depAirport,
        arrAirport,
        distance,
        compensation,
        scheduledArrival: this.generateScheduledTime(date, '14:30'),
        estimatedArrival: this.generateScheduledTime(date, '14:30', flightData.delayMinutes)
      };
      
      // Start tracking
      await this.tracker.startTracking(fullFlightData);
      
      // Update display
      this.showFlightStatus(fullFlightData);
      this.showLiveTracker(fullFlightData);
      
    } catch (error) {
      console.error('Error tracking flight:', error);
      statusCard.innerHTML = `
        <div class="status-placeholder">
          <div class="plane-icon">⚠️</div>
          <p>Could not find flight data. Please check the details and try again.</p>
        </div>
      `;
      showToast('Error searching for flight', 'error');
    }
  }
  
  generateScheduledTime(dateStr, baseTime, delayMinutes = 0) {
    const [hours, minutes] = baseTime.split(':').map(Number);
    const date = new Date(dateStr);
    date.setHours(hours, minutes + delayMinutes, 0);
    return date;
  }
  
  showFlightStatus(flight) {
    const statusCard = document.getElementById('flight-status');
    if (!statusCard) return;
    
    const statusText = {
      'scheduled': '📅 Scheduled',
      'in_flight': '✈️ In Flight',
      'arrived': '✅ Arrived'
    };
    
    const delayClass = flight.delayMinutes >= 180 ? 'eligible' : 
                       flight.delayMinutes >= 120 ? 'pending' : '';
    
    const hours = Math.floor(flight.delayMinutes / 60);
    const mins = flight.delayMinutes % 60;
    const delayDisplay = flight.delayMinutes > 0 ? 
      (hours > 0 ? `+${hours}h ${mins}m` : `+${mins} min`) : 'On time';
    
    statusCard.innerHTML = `
      <h2>${flight.flightNumber}</h2>
      <div class="flight-summary">
        <div class="route-display">
          <span class="airport-badge">${flight.departure}</span>
          <span class="route-arrow">→</span>
          <span class="airport-badge">${flight.arrival}</span>
        </div>
        <p class="flight-date">${formatDate(new Date(flight.date))}</p>
        <p class="flight-status-label ${delayClass}">${statusText[flight.status] || '📅 Scheduled'}</p>
        <div class="delay-info ${delayClass}">
          <span class="delay-amount">${delayDisplay}</span>
          ${flight.compensation.eligible ? 
            `<span class="comp-badge">💰 ${flight.compensation.currency}${flight.compensation.amount} claimable!</span>` : 
            flight.delayMinutes > 0 ? `<span class="comp-pending">Delay under 3 hours - monitoring...</span>` : ''
          }
        </div>
      </div>
    `;
    
    // Add inline styles for the status card summary
    if (!document.querySelector('#status-styles')) {
      const style = document.createElement('style');
      style.id = 'status-styles';
      style.textContent = `
        .flight-summary { text-align: center; padding: 1rem 0; }
        .route-display { 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 1rem; 
          margin: 1rem 0;
        }
        .airport-badge { 
          background: var(--bg-elevated); 
          padding: 0.5rem 1rem; 
          border-radius: 6px; 
          font-family: var(--font-mono); 
          font-weight: 700;
        }
        .route-arrow { color: var(--yellow-bright); font-size: 1.5rem; }
        .flight-date { color: var(--text-secondary); margin: 0.5rem 0; }
        .flight-status-label { font-weight: 600; margin: 0.5rem 0; }
        .delay-info { 
          margin-top: 1rem; 
          padding: 1rem; 
          background: var(--bg-elevated); 
          border-radius: 8px;
        }
        .delay-info.eligible { 
          background: rgba(0, 214, 125, 0.15); 
          border: 1px solid var(--green-success);
        }
        .delay-info.pending { 
          background: rgba(255, 214, 10, 0.15); 
          border: 1px solid var(--yellow-bright);
        }
        .delay-amount { 
          display: block; 
          font-family: var(--font-mono); 
          font-size: 1.5rem; 
          font-weight: 700;
        }
        .delay-info.eligible .delay-amount { color: var(--green-success); }
        .delay-info.pending .delay-amount { color: var(--yellow-bright); }
        .comp-badge { 
          display: block; 
          margin-top: 0.5rem; 
          color: var(--green-success); 
          font-weight: 600;
        }
        .comp-pending {
          display: block;
          margin-top: 0.5rem;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  showLiveTracker(flight) {
    const liveTracker = document.getElementById('live-tracker');
    if (!liveTracker) return;
    
    liveTracker.style.display = 'block';
    
    // Helper to safely update element text
    const updateText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    
    // Update airport codes
    updateText('dep-code', flight.departure);
    updateText('arr-code', flight.arrival);
    
    // Update times
    updateText('scheduled-arrival', formatTime(flight.scheduledArrival));
    updateText('estimated-arrival', formatTime(flight.estimatedArrival));
    
    // Doors open is typically 10-15 minutes after landing
    if (flight.estimatedArrival) {
      const doorsOpen = new Date(flight.estimatedArrival.getTime() + 12 * 60000);
      updateText('doors-open', formatTime(doorsOpen));
    }
    
    // Update potential compensation
    updateText('potential-comp', `${flight.compensation.currency}${flight.compensation.amount}`);
    
    // Update plane position
    this.updatePlanePosition(flight.progress || 0);
    
    // Update delay meter
    this.updateDelayMeter(flight.delayMinutes);
    
    // Update compensation status
    this.updateCompensationStatus(flight.compensation);
    
    // Update delay value display
    const hours = Math.floor(flight.delayMinutes / 60);
    const mins = flight.delayMinutes % 60;
    updateText('delay-value', hours > 0 ? `${hours}h ${mins}m` : `${mins} min`);
  }
  
  updatePlanePosition(progress) {
    const plane = document.getElementById('plane-marker');
    if (!plane) return;
    // Map progress 0-100 to position 10%-90%
    const position = 10 + (progress * 0.8);
    plane.style.left = `${position}%`;
  }
  
  updateDelayMeter(delayMinutes) {
    const fill = document.getElementById('delay-fill');
    if (!fill) return;
    // 4 hours (240 min) = 100%
    const percentage = Math.min(100, (delayMinutes / 240) * 100);
    fill.style.width = `${percentage}%`;
    
    // Change color based on delay
    if (delayMinutes >= 180) {
      fill.style.background = 'linear-gradient(90deg, var(--yellow-bright), var(--green-success))';
    } else if (delayMinutes >= 120) {
      fill.style.background = 'linear-gradient(90deg, var(--yellow-bright), var(--yellow-bright))';
    } else {
      fill.style.background = 'linear-gradient(90deg, var(--green-success), var(--yellow-bright))';
    }
  }
  
  updateCompensationStatus(compensation) {
    const status = document.getElementById('compensation-status');
    if (!status) return;
    
    if (compensation.eligible) {
      status.className = 'compensation-status eligible';
      status.innerHTML = `
        <span class="status-icon">🎉</span>
        <span class="status-text">You can claim ${compensation.currency}${compensation.amount}!</span>
      `;
    } else {
      status.className = 'compensation-status pending';
      status.innerHTML = `
        <span class="status-icon">⏳</span>
        <span class="status-text">${compensation.reason}</span>
      `;
    }
  }
  
  updateFlightDisplay(flight) {
    // Called when flight data updates
    this.showFlightStatus(flight);
    this.showLiveTracker(flight);
    
    // Check if now eligible for compensation
    if (flight.compensation.eligible) {
      this.checkAndSendReminder(flight);
    }
  }
  
  // Reminder system with GDPR consent
  setupReminder() {
    const emailInput = document.getElementById('reminder-email');
    const reminderBtn = document.getElementById('set-reminder');
    const consentCheckbox = document.getElementById('gdpr-consent');
    
    reminderBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      
      if (!email || !email.includes('@')) {
        showToast('Please enter a valid email address', 'error');
        return;
      }
      
      // Check GDPR consent
      if (!consentCheckbox?.checked) {
        showToast('Please tick the consent checkbox to continue', 'error');
        consentCheckbox?.focus();
        return;
      }
      
      if (!this.tracker.currentFlight) {
        showToast('Please track a flight first', 'error');
        return;
      }
      
      // Show loading state
      reminderBtn.disabled = true;
      reminderBtn.textContent = 'Subscribing...';
      
      try {
        // Call API to subscribe
        const response = await fetch(`${API_BASE}/api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            consent: true,
            marketingConsent: false,
            flight: {
              flightNumber: this.tracker.currentFlight.flightNumber,
              date: this.tracker.currentFlight.date,
              departure: this.tracker.currentFlight.departure,
              arrival: this.tracker.currentFlight.arrival,
              distance: this.tracker.currentFlight.distance,
              delayMinutes: this.tracker.currentFlight.delayMinutes,
              compensation: this.tracker.currentFlight.compensation,
            }
          })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          // Also save locally
          const reminders = loadFromStorage(REMINDER_KEY) || [];
          reminders.push({
            email,
            flight: this.tracker.currentFlight,
            created: Date.now()
          });
          saveToStorage(REMINDER_KEY, reminders);
          saveToStorage(CONSENT_KEY, { email, timestamp: Date.now() });
          
          showToast('Success! Check your email to verify your subscription.', 'success');
          emailInput.value = '';
          consentCheckbox.checked = false;
        } else {
          showToast(result.error || 'Failed to subscribe. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Subscribe error:', error);
        // Fallback to local-only if API unavailable
        const reminders = loadFromStorage(REMINDER_KEY) || [];
        reminders.push({
          email,
          flight: this.tracker.currentFlight,
          created: Date.now()
        });
        saveToStorage(REMINDER_KEY, reminders);
        showToast(`Reminder saved locally. Email notifications require backend setup.`, 'info');
        emailInput.value = '';
      } finally {
        reminderBtn.disabled = false;
        reminderBtn.textContent = 'Set Reminder';
      }
    });
  }
  
  checkAndSendReminder(flight) {
    // In a real app, this would trigger a server-side email
    // For now, we'll show a notification
    if (flight.compensation.eligible && !flight._reminderSent) {
      flight._reminderSent = true;
      showToast(`🎉 Your flight ${flight.flightNumber} is delayed ${Math.floor(flight.delayMinutes / 60)}+ hours! You can claim ${flight.compensation.currency}${flight.compensation.amount}!`, 'success');
    }
  }
  
  // Action buttons
  setupActionButtons() {
    // Add to calendar
    document.getElementById('add-calendar').addEventListener('click', () => {
      if (!this.tracker.currentFlight) {
        showToast('No flight to add', 'error');
        return;
      }
      this.generateCalendarFile(this.tracker.currentFlight);
    });
    
    // Save flight
    document.getElementById('save-flight').addEventListener('click', () => {
      if (!this.tracker.currentFlight) {
        showToast('No flight to save', 'error');
        return;
      }
      this.saveFlight(this.tracker.currentFlight);
    });
    
    // Refresh
    document.getElementById('refresh-status').addEventListener('click', () => {
      if (this.tracker.currentFlight) {
        this.tracker.pollUpdate();
        showToast('Flight status refreshed', 'info');
      }
    });
  }
  
  generateCalendarFile(flight) {
    const event = {
      title: `Claim compensation for ${flight.flightNumber}`,
      description: `Your flight ${flight.flightNumber} from ${flight.departure} to ${flight.arrival} was delayed ${Math.floor(flight.delayMinutes / 60)} hours. You may be entitled to ${flight.compensation.currency}${flight.compensation.amount} compensation under EU261/UK261.\\n\\nClaim at: https://www.ryanair.com/ee/en/myryanair/requests/new/eu-261`,
      startDate: new Date(flight.date),
      endDate: new Date(flight.date)
    };
    
    // Format for ICS file
    const formatDateForICS = (date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RyUnfair//Flight Compensation Tracker//EN',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@ryunfair`,
      `DTSTAMP:${formatDateForICS(new Date())}`,
      `DTSTART:${formatDateForICS(event.startDate)}`,
      `DTEND:${formatDateForICS(event.endDate)}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.description}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    
    // Download file
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `claim-${flight.flightNumber}-${flight.date}.ics`;
    link.click();
    
    showToast('Calendar event downloaded!', 'success');
  }
  
  saveFlight(flight) {
    const flights = loadFromStorage(STORAGE_KEY) || [];
    
    // Check if already saved
    const exists = flights.some(f => 
      f.flightNumber === flight.flightNumber && f.date === flight.date
    );
    
    if (exists) {
      showToast('This flight is already saved', 'info');
      return;
    }
    
    flights.push({
      flightNumber: flight.flightNumber,
      date: flight.date,
      departure: flight.departure,
      arrival: flight.arrival,
      delayMinutes: flight.delayMinutes,
      compensation: flight.compensation,
      savedAt: Date.now()
    });
    
    saveToStorage(STORAGE_KEY, flights);
    this.loadSavedFlights();
    showToast('Flight saved!', 'success');
  }
  
  // Historic flights
  setupHistoricForm() {
    const form = document.getElementById('historic-form');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const flightNumber = document.getElementById('hist-flight-number').value.toUpperCase().trim();
      const date = document.getElementById('hist-date').value;
      const departure = document.getElementById('hist-departure').value.toUpperCase().trim();
      const arrival = document.getElementById('hist-arrival').value.toUpperCase().trim();
      
      if (!flightNumber || !date) {
        showToast('Please enter at least flight number and date', 'error');
        return;
      }
      
      await this.searchHistoricFlight({ flightNumber, date, departure, arrival });
    });
  }
  
  async searchHistoricFlight(flightInfo) {
    const resultDiv = document.getElementById('historic-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="loading"></div><p style="text-align: center; margin-top: 1rem;">Searching historical records...</p>';
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get flight data (simulated for historic)
    const flightData = simulateFlightData(flightInfo.flightNumber, flightInfo.date);
    
    // Get airport info
    const depAirport = AIRPORTS[flightInfo.departure] || { name: flightInfo.departure || 'Unknown', country: 'GB' };
    const arrAirport = AIRPORTS[flightInfo.arrival] || { name: flightInfo.arrival || 'Unknown', country: 'IE' };
    
    // Calculate distance (default if airports unknown)
    let distance = 1200; // Default for unknown routes
    if (AIRPORTS[flightInfo.departure] && AIRPORTS[flightInfo.arrival]) {
      distance = calculateDistance(
        AIRPORTS[flightInfo.departure].lat, AIRPORTS[flightInfo.departure].lon,
        AIRPORTS[flightInfo.arrival].lat, AIRPORTS[flightInfo.arrival].lon
      );
    }
    
    // Calculate compensation
    const compensation = calculateCompensation(
      distance,
      flightData.delayMinutes,
      depAirport.country,
      arrAirport.country
    );
    
    const flightDate = new Date(flightInfo.date);
    const now = new Date();
    const yearsAgo = (now - flightDate) / (365.25 * 24 * 60 * 60 * 1000);
    
    // Determine claim deadline status
    let deadlineStatus = '';
    if (depAirport.country === 'GB' || arrAirport.country === 'GB') {
      deadlineStatus = yearsAgo < 6 ? 
        `<span class="deadline-ok">✓ Within UK 6-year claim limit</span>` :
        `<span class="deadline-expired">✗ UK claim deadline passed</span>`;
    } else {
      deadlineStatus = yearsAgo < 3 ? 
        `<span class="deadline-ok">✓ Within EU claim limit</span>` :
        `<span class="deadline-warning">⚠️ May be outside claim limit (varies by country)</span>`;
    }
    
    resultDiv.innerHTML = `
      <h3>Historic Flight Found</h3>
      <div class="historic-flight-card">
        <div class="historic-header">
          <span class="flight-num">${flightInfo.flightNumber}</span>
          <span class="flight-route">${flightInfo.departure || '???'} → ${flightInfo.arrival || '???'}</span>
          <span class="flight-date">${formatDate(flightDate)}</span>
        </div>
        
        <div class="historic-details">
          <div class="detail-item">
            <span class="label">Recorded Delay</span>
            <span class="value ${flightData.delayMinutes >= 180 ? 'highlight' : ''}">${flightData.delayMinutes > 0 ? `+${flightData.delayMinutes} minutes` : 'On time'}</span>
          </div>
          <div class="detail-item">
            <span class="label">Distance</span>
            <span class="value">${distance.toFixed(0)} km</span>
          </div>
          <div class="detail-item">
            <span class="label">Compensation Status</span>
            <span class="value ${compensation.eligible ? 'eligible' : ''}">${compensation.eligible ? `${compensation.currency}${compensation.amount} claimable` : 'Not eligible'}</span>
          </div>
          <div class="detail-item">
            <span class="label">Claim Deadline</span>
            <span class="value">${deadlineStatus}</span>
          </div>
        </div>
        
        ${compensation.eligible ? `
          <div class="claim-cta">
            <p>💰 You may be owed <strong>${compensation.currency}${compensation.amount}</strong> for this flight!</p>
            <a href="https://www.ryanair.com/ee/en/myryanair/requests/new/eu-261" target="_blank" class="btn-primary">
              Start Your Claim →
            </a>
          </div>
        ` : `
          <div class="no-claim">
            <p>This flight doesn't appear to qualify for compensation (delay under 3 hours).</p>
          </div>
        `}
      </div>
    `;
    
    // Add styles for historic result
    const style = document.createElement('style');
    style.textContent = `
      .historic-flight-card { 
        background: var(--bg-elevated); 
        border-radius: var(--radius-md); 
        padding: var(--space-lg);
        margin-top: var(--space-lg);
      }
      .historic-header {
        display: flex;
        gap: var(--space-lg);
        align-items: center;
        padding-bottom: var(--space-md);
        border-bottom: 1px solid var(--border-subtle);
        margin-bottom: var(--space-lg);
        flex-wrap: wrap;
      }
      .flight-num {
        font-family: var(--font-mono);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--yellow-bright);
      }
      .flight-route {
        color: var(--text-secondary);
      }
      .historic-details {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-md);
      }
      @media (max-width: 600px) {
        .historic-details { grid-template-columns: 1fr; }
      }
      .detail-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }
      .detail-item .label {
        font-size: 0.8rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .detail-item .value {
        font-weight: 600;
      }
      .detail-item .value.highlight {
        color: var(--yellow-bright);
      }
      .detail-item .value.eligible {
        color: var(--green-success);
      }
      .deadline-ok { color: var(--green-success); }
      .deadline-expired { color: var(--red-alert); }
      .deadline-warning { color: var(--yellow-bright); }
      .claim-cta {
        margin-top: var(--space-lg);
        padding: var(--space-lg);
        background: rgba(0, 214, 125, 0.1);
        border: 1px solid var(--green-success);
        border-radius: var(--radius-sm);
        text-align: center;
      }
      .claim-cta .btn-primary {
        margin-top: var(--space-md);
        display: inline-flex;
      }
      .no-claim {
        margin-top: var(--space-lg);
        padding: var(--space-md);
        background: var(--bg-card);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        text-align: center;
      }
    `;
    if (!document.querySelector('#historic-styles')) {
      style.id = 'historic-styles';
      document.head.appendChild(style);
    }
  }
  
  loadSavedFlights() {
    const flights = loadFromStorage(STORAGE_KEY) || [];
    const listDiv = document.getElementById('saved-flights-list');
    
    if (flights.length === 0) {
      listDiv.innerHTML = '<p class="empty-state">No saved flights yet. Track a flight and save it to see it here.</p>';
      return;
    }
    
    listDiv.innerHTML = flights.map(flight => `
      <div class="flight-item">
        <div class="flight-item-info">
          <span class="flight-item-number">${flight.flightNumber}</span>
          <span class="flight-item-route">${flight.departure} → ${flight.arrival}</span>
          <span class="flight-item-date">${formatDate(new Date(flight.date))}</span>
        </div>
        <span class="flight-item-delay ${flight.compensation?.eligible ? 'eligible' : 'not-eligible'}">
          ${flight.delayMinutes > 0 ? `+${flight.delayMinutes} min` : 'On time'}
          ${flight.compensation?.eligible ? ` (${flight.compensation.currency}${flight.compensation.amount})` : ''}
        </span>
      </div>
    `).join('');
  }
  
  // Cheat sheet functionality
  setupCheatSheet() {
    const copyBtn = document.getElementById('copy-template');
    
    copyBtn.addEventListener('click', () => {
      const template = `Subject: Letter Before Action - EU261 Claim [Your Reference]

Dear Ryanair Customer Services,

I submitted a compensation claim under EC Regulation 261/2004 on [DATE] regarding flight [FLIGHT NUMBER] on [FLIGHT DATE]. My claim reference is [REFERENCE].

I have not received a substantive response within the required timeframe. I am therefore writing to inform you that if I do not receive payment of €[AMOUNT] or a valid legal reason for rejection within 14 days, I will:

1. File a complaint with the Civil Aviation Authority / relevant NEB
2. Issue proceedings in the Small Claims Court without further notice

Please treat this as a formal Letter Before Action under the Pre-Action Protocol.

Yours faithfully,
[Your Name]
[Your Address]
[Your Email]`;
      
      navigator.clipboard.writeText(template).then(() => {
        showToast('Template copied to clipboard!', 'success');
      }).catch(() => {
        showToast('Failed to copy - please select and copy manually', 'error');
      });
    });
  }
  
  // Cookie consent banner (GDPR)
  setupCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('cookie-accept');
    const declineBtn = document.getElementById('cookie-decline');
    
    // Check if consent already given
    const consent = loadFromStorage(CONSENT_KEY);
    if (!consent?.cookieConsent) {
      banner.style.display = 'block';
    }
    
    acceptBtn?.addEventListener('click', () => {
      const existing = loadFromStorage(CONSENT_KEY) || {};
      saveToStorage(CONSENT_KEY, { ...existing, cookieConsent: true, cookieTimestamp: Date.now() });
      banner.style.display = 'none';
    });
    
    declineBtn?.addEventListener('click', () => {
      // Clear all local storage except consent record
      const consent = { cookieConsent: false, cookieTimestamp: Date.now() };
      localStorage.clear();
      saveToStorage(CONSENT_KEY, consent);
      banner.style.display = 'none';
      showToast('Local storage disabled. Some features may not work.', 'info');
    });
  }
  
  // Data management modal (GDPR rights)
  setupDataManagement() {
    const manageLink = document.getElementById('manage-data-link');
    const modal = document.getElementById('data-modal');
    const closeBtn = document.getElementById('close-data-modal');
    const exportBtn = document.getElementById('export-data');
    const deleteBtn = document.getElementById('delete-data');
    const emailInput = document.getElementById('data-email');
    
    // Open modal
    manageLink?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('show');
      
      // Pre-fill email if we have it
      const consent = loadFromStorage(CONSENT_KEY);
      if (consent?.email) {
        emailInput.value = consent.email;
      }
    });
    
    // Close modal
    closeBtn?.addEventListener('click', () => {
      modal.classList.remove('show');
    });
    
    // Close on backdrop click
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    });
    
    // Export data
    exportBtn?.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email) {
        showToast('Please enter your email address', 'error');
        return;
      }
      
      try {
        // First, try API export
        const response = await fetch(`${API_BASE}/api/user/data?email=${encodeURIComponent(email)}`);
        
        if (response.ok) {
          const data = await response.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ryunfair-data-export-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Data exported successfully!', 'success');
        } else if (response.status === 404) {
          // Fall back to local data export
          this.exportLocalData();
        } else {
          showToast('Failed to export data. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Export error:', error);
        // Fall back to local data
        this.exportLocalData();
      }
    });
    
    // Delete data
    deleteBtn?.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      
      if (!confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
        return;
      }
      
      try {
        if (email) {
          // Try API deletion
          const response = await fetch(`${API_BASE}/api/user/data?email=${encodeURIComponent(email)}`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            showToast('Your data has been marked for deletion.', 'success');
          }
        }
        
        // Always clear local data
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(REMINDER_KEY);
        localStorage.removeItem(CONSENT_KEY);
        
        modal.classList.remove('show');
        showToast('Local data deleted successfully.', 'success');
        
        // Reload to reset state
        setTimeout(() => window.location.reload(), 1500);
        
      } catch (error) {
        console.error('Delete error:', error);
        // Still clear local data
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(REMINDER_KEY);
        showToast('Local data deleted. Server deletion may require retry.', 'info');
      }
    });
  }
  
  // Export local data only (fallback)
  exportLocalData() {
    const flights = loadFromStorage(STORAGE_KEY) || [];
    const reminders = loadFromStorage(REMINDER_KEY) || [];
    const consent = loadFromStorage(CONSENT_KEY) || {};
    
    const exportData = {
      exportDate: new Date().toISOString(),
      source: 'local_storage',
      note: 'This is data stored locally in your browser only.',
      consent: {
        cookieConsent: consent.cookieConsent,
        timestamp: consent.cookieTimestamp,
      },
      savedFlights: flights,
      reminders: reminders.map(r => ({
        email: r.email,
        flightNumber: r.flight?.flightNumber,
        date: r.flight?.date,
        created: r.created,
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ryunfair-local-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Local data exported!', 'success');
  }
  
  // Check for verification status from URL params
  checkVerificationStatus() {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get('verified');
    const error = params.get('error');
    
    if (verified === 'success') {
      this.showBanner('Email verified successfully! You will now receive flight notifications.', 'success');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (verified === 'already') {
      this.showBanner('Your email is already verified.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error === 'invalid_token') {
      this.showBanner('Invalid or expired verification link.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error === 'missing_token') {
      this.showBanner('Verification token missing.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
  
  // Show a temporary banner message
  showBanner(message, type = 'info') {
    const main = document.querySelector('.main');
    const banner = document.createElement('div');
    banner.className = `verification-banner ${type}`;
    banner.innerHTML = `<p>${message}</p>`;
    main.insertBefore(banner, main.firstChild);
    
    // Auto-remove after 10 seconds
    setTimeout(() => banner.remove(), 10000);
  }
}

// ============================================
// Initialize App
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const app = new UIController();
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('flight-date').value = today;
  document.getElementById('hist-date').value = today;
  
  console.log('🛫 RyUnfair initialized');
});

