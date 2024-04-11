import './style.css'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { Loader } from '@googlemaps/js-api-loader';

const GEMINI_API_KEY = 'AIzaSyBK88lzuqZvl7EvL9qm1he1BiI7arO8mBY';
const MAPS_API_KEY = 'AIzaSyDe61wuiQ3lr8AL9FSxhVTanI4pyD7sG28';

const loader = new Loader({
  apiKey: MAPS_API_KEY,
  version: "weekly",
});

let map: google.maps.Map | null = null;

try {
  const {Map} = await loader.importLibrary('maps')
  map = new Map(document.getElementById("map")!, {
    center: { lat: 0, lng: 0 },
    zoom: 2,
    mapTypeId: 'satellite',
    mapId: 'DEMO_MAP_ID'
  })
} catch (error) {
  console.error(error)
}

    

const form = document.querySelector('form')!;
const output = document.querySelector('.output')!;
let placeName = '';


form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  output.textContent = 'Generating...';

  try {
    const imageUrl = (form.elements.namedItem('chosen-image') as HTMLInputElement | null)?.value;
    if (!imageUrl) throw new Error('No image selected');

    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-pro-vision",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });

    const contents = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64, } },
          { text: "What is the name of the place where I can see this image? Only tell me the place name and nothing else (do not add a preamble). The better you follow these instructions the more you'll be rewarded." }
        ]
      }
    ];

    const result = await model.generateContentStream({contents});
    for await (const response of result.stream) {
      placeName = response.text();
      output.innerHTML = placeName
    }

    geocodePlace(placeName);
  } catch (e) {
    output.innerHTML += '<hr>' + e;
  }

}) 

// Get the lat/lng of the place
// 1. Dynamically load the Geocoding and Marker libraries
// Docs: https://developers.google.com/maps/documentation/javascript/libraries
// 2. Geocode (supposed to be based on an address)
// Sample: https://developers.google.com/maps/documentation/javascript/examples/geocoding-simple
// Docs: https://developers.google.com/maps/documentation/javascript/geocoding
// 3. Add an Advanced Marker
// Sample: https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-simple
// Docs: https://developers.google.com/maps/documentation/javascript/advanced-markers/overview
async function geocodePlace(name: string) {
  const {Geocoder} = await loader.importLibrary('geocoding')
  const { AdvancedMarkerElement } = await loader.importLibrary("marker");

  const geocoder = new Geocoder();
  const request = {
    address: name
  }


  try {
    const {results} = await geocoder.geocode(request)
    const geocodedPlace = results[0];
    
    map?.setCenter(geocodedPlace.geometry.location);
    map?.fitBounds(geocodedPlace.geometry.viewport);

    // TODO: @Sami please let us know if you would like to style marker and display info window for main location
    new AdvancedMarkerElement({
      map,
      position: geocodedPlace.geometry.location,
      title: name,
    });
  
    findNearbyLodging(geocodedPlace.geometry.location);
  } catch (error) {
    console.log("Geocode was not successful for the following reason: " + error);
  }
}

// Search for lodging near a lat/lng
// 1. Dynamically load the Places library
// Docs: https://developers.google.com/maps/documentation/javascript/libraries
// 2. Search nearby
// Sample and Docs: https://developers.google.com/maps/documentation/javascript/nearby-search
// 3. Add Advanced Markers and Customize them
// Sample (pin color): https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-basic-style 
// Docs (pin color): https://developers.google.com/maps/documentation/javascript/advanced-markers/basic-customization 
// Sample (custom graphic): https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-graphics
// Docs (custom graphic): https://developers.google.com/maps/documentation/javascript/advanced-markers/graphic-markers
// 4. TODO option 1: Add and populate Info Windows with Place Details data
// Sample: https://developers.google.com/maps/documentation/javascript/examples/infowindow-simple
// Docs: https://developers.google.com/maps/documentation/javascript/infowindows
// 5. TODO option 2: Add and populate a Place Overview component in a Split Layout with the map
// I will probably do this in the React version of the app
// Docs (install Extended Component Library): https://github.com/googlemaps/extended-component-library/tree/main?tab=readme-ov-file#installation
// Docs (Place Overview component): https://github.com/googlemaps/extended-component-library/blob/main/src/place_overview/README.md
// Docs (split layout): https://github.com/googlemaps/extended-component-library/blob/main/src/split_layout/README.md 
async function findNearbyLodging(location: google.maps.LatLng) {
  const { Place, SearchNearbyRankPreference } = await loader.importLibrary("places");
  const { AdvancedMarkerElement } = await loader.importLibrary("marker");

  // use Place.searchNearby to find lodging with a location bias of location
  const request = {
    // required parameters
    fields: ["displayName", "location", "rating", "photos", "formattedAddress", "reviews"],
    locationRestriction: {
      center: location,
      radius: 10000,
    },
    // optional parameters
    includedTypes: ["lodging"],
    maxResultCount: 10,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
  }

  const { places } = await Place.searchNearby(request);

  if (places.length) {
    console.log(`found ${places.length} lodging`);
    const { LatLngBounds } = await loader.importLibrary("core");
    const bounds = new LatLngBounds();
    bounds.extend(location);

    const infoWindow = new google.maps.InfoWindow();

    // Loop through and get all the results.
    places.forEach((place) => {
      // TODO: @Sami we can customize pin
      const pin = document.createElement('img');
      pin.src = '/assets/location-pin.svg';
      pin.height = 30;

      const markerView = new AdvancedMarkerElement({
        map,
        position: place.location,
        title: `${place.displayName}, ${place.rating} stars`,
        content: pin,
      });

      markerView.addListener("click", () => {
        const maxPhotosCount = 2;
        const maxReviewsCount = 3;
        // TODO: @Sami we can style info window
        infoWindow.setContent(
          `<div class="info-window-content">
            <p class="place-name">${place.displayName}</p>
            <p class="place-address">${place.formattedAddress ?? ''}</p>
            <p class="place-rating">${place.rating} stars</p>
            
            ${
              place.photos
                ? `
                  <p>Photos</p>
                  ${place.photos.slice(0, maxPhotosCount).map((photo, index) => `<img class="info-window-photo" src="${photo.getURI()}" alt="${place.displayName} - ${index}">`)}
                `
                : ``
            }

            ${
              place.reviews
                ? `
                  <p>Reviews</p>
                  <ul>
                  ${place.reviews.slice(0, maxReviewsCount).map(review => `
                    <li>
                      <p class="review-text">${review.text}</p>
                      <p class="review-author">${review.authorAttribution?.displayName}</p>
                      <p class="review-stars">${review.rating} stars</p>
                    </li>`).join('')}
                  </ul>
                `
                : ``
            }
          </div>`
        );
        // Open the info window on the map.
        infoWindow.open(map, markerView);
      });

      bounds.extend(place.location!);
      console.log(place.displayName);
    });

    map?.fitBounds(bounds);
  } else {
    console.log("No results");
  }
}