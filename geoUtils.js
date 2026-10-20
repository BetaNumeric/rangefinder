// geoUtils.js
/*
Geographic calculation utilities
Consolidates distance and bearing calculations used throughout the app
*/

/**
 * Distance rounding ranges (in kilometers)
 * Used for consistent distance display throughout the app
 */
const DISTANCE_ROUNDING_RANGES = [
  { max: 0.01, decimals: 3 },    // < 10m: show to nearest meter
  { max: 0.1, decimals: 2 },     // < 100m: show to nearest 10m
  { max: 1, decimals: 1 },       // < 1km: show to nearest 100m
  { max: 10, decimals: 1 },      // < 10km: show to nearest 100m
  { max: 100, decimals: 0 },     // < 100km: show to nearest km
  { max: 1000, decimals: 0 },    // < 1000km: show to nearest km
  { max: 10000, decimals: -1 },  // < 10,000km: show to nearest 10km
  { max: 20000, decimals: -2 }   // < 20,000km: show to nearest 100km
];

const geoUtils = {
  /**
   * Earth's radius in kilometers
   */
  EARTH_RADIUS_KM: 6371,

  /**
   * Calculates the great circle distance between two points using the Haversine formula
   * @param {number} lat1 - Latitude of point 1 in degrees
   * @param {number} lon1 - Longitude of point 1 in degrees
   * @param {number} lat2 - Latitude of point 2 in degrees
   * @param {number} lon2 - Longitude of point 2 in degrees
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const φ1 = this.toRadians(lat1);
    const φ2 = this.toRadians(lat2);
    const Δφ = this.toRadians(lat2 - lat1);
    const Δλ = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return this.EARTH_RADIUS_KM * c;
  },

  /**
   * Calculates the bearing (direction) from point 1 to point 2
   * @param {number} lat1 - Latitude of point 1 in degrees
   * @param {number} lon1 - Longitude of point 1 in degrees
   * @param {number} lat2 - Latitude of point 2 in degrees
   * @param {number} lon2 - Longitude of point 2 in degrees
   * @returns {number} Bearing in degrees (0-360)
   */
  calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = this.toRadians(lat1);
    const φ2 = this.toRadians(lat2);
    const λ1 = this.toRadians(lon1);
    const λ2 = this.toRadians(lon2);
    
    const y = Math.sin(λ2-λ1) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) -
              Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
    
    const θ = Math.atan2(y, x);
    
    return (this.toDegrees(θ) + 360) % 360;
  },

  /**
   * Calculates destination point given start point, distance, and bearing
   * @param {number} lat - Starting latitude in degrees
   * @param {number} lon - Starting longitude in degrees
   * @param {number} distance - Distance in kilometers
   * @param {number} bearing - Bearing in degrees
   * @returns {{lat: number, lon: number}} Destination coordinates
   */
  computeDestinationLatLon(lat, lon, distance, bearing) {
    const δ = distance / this.EARTH_RADIUS_KM;
    const θ = this.toRadians(bearing);
    const φ1 = this.toRadians(lat);
    const λ1 = this.toRadians(lon);
    
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) +
      Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
    );
    
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
    
    return {
      lat: this.toDegrees(φ2),
      lon: this.toDegrees(λ2)
    };
  },

  /**
   * Converts degrees to radians
   * @param {number} degrees
   * @returns {number} Radians
   */
  toRadians(degrees) {
    return degrees * Math.PI / 180;
  },

  /**
   * Converts radians to degrees
   * @param {number} radians
   * @returns {number} Degrees
   */
  toDegrees(radians) {
    return radians * 180 / Math.PI;
  },

  /**
   * Rounds distance according to standardized ranges
   * @param {number} distance - Distance in kilometers
   * @returns {number} Rounded distance
   */
  roundDistance(distance) {
    for (let range of DISTANCE_ROUNDING_RANGES) {
      if (distance <= range.max) {
        if (range.decimals >= 0) {
          return Number(distance.toFixed(range.decimals));
        } else {
          const factor = Math.pow(10, -range.decimals);
          return Math.round(distance / factor) * factor;
        }
      }
    }
    return Math.round(distance);
  }
};

// Backward compatibility aliases for existing code
function calculateDistance(lat1, lon1, lat2, lon2) {
  return geoUtils.calculateDistance(lat1, lon1, lat2, lon2);
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  return geoUtils.calculateBearing(lat1, lon1, lat2, lon2);
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  return geoUtils.calculateDistance(lat1, lon1, lat2, lon2);
}

function toRad(value) {
  return geoUtils.toRadians(value);
}

function computeDestinationLatLon(lat, lon, distance, bearing) {
  return geoUtils.computeDestinationLatLon(lat, lon, distance, bearing);
}

