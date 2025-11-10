/* eslint-disable */

export default function displayMap(locations) {
  mapboxgl.accessToken =
    'pk.eyJ1Ijoid2Vic2l0ZXMyNGNvbSIsImEiOiJjbWhjOGoxYWkwOTk3MmtwdDg1cDl6ZG5lIn0.5FgTFDX94oymhgN9QovJGg';

  const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/websites24com/cmhcdn8u5002301s52pvu6343', // style URL
    scrollZoom: false,
    // center: [-74.5, 40], // starting position [lng, lat]
    // zoom: 9, // starting zoom
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach((loc) => {
    // Create marker
    const el = document.createElement('div');
    el.className = 'marker';

    // Add marker
    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat(loc.coordinates)
      .addTo(map);
    // Extend map bounds to include current location

    // Add popup

    new mapboxgl.Popup({
      offset: 30,
    })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day}: ${loc.description}</p>`)
      .addTo(map);

    bounds.extend(loc.coordinates);
  });

  map.fitBounds(bounds, {
    padding: {
      top: 200,
      bottom: 150,
      left: 100,
      right: 100,
    },
  });
}
