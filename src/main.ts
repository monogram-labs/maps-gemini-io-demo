import {
  GenerateContentRequest,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { Loader } from "@googlemaps/js-api-loader";
import Base64 from "base64-js";
import "./style.css";

// TODO: rewrite to mention integrations panel?
// 🔥 FILL THIS OUT FIRST! 🔥
// 🔥 GET YOUR GEMINI API KEY AT 🔥
// 🔥 https://g.co/ai/idxGetGeminiKey 🔥
const GEMINI_API_KEY = "AIzaSyBK88lzuqZvl7EvL9qm1he1BiI7arO8mBY";

// TODO: rewrite to mention integrations panel?
// Open the Integrations panel to Enable the Maps JavaScript API
// Get your Maps and Places API key at https://developers.google.com/maps/documentation/javascript/get-api-key
// Be sure to enable Maps JavaScript API, Geocoding API, and Places API (New)
// (maybe forget to enable Geocoding API until the DevTools console shows us the APINotEnabled error message)
const MAPS_API_KEY = "AIzaSyDe61wuiQ3lr8AL9FSxhVTanI4pyD7sG28";

const loader = new Loader({
  apiKey: MAPS_API_KEY,
  version: "weekly",
});

const form: HTMLFormElement | null = document.querySelector("form");
if (!form) {
  throw new Error("form not found");
}

const output: HTMLElement | null = document.querySelector(".output");
if (!output) {
  throw new Error(".output not found");
}

let map: google.maps.Map;
let placeName = "";

/**
 * Add a map
 * Sample: https://developers.google.com/maps/documentation/javascript/examples/map-simple
 * Docs: https://developers.google.com/maps/documentation/javascript/adding-a-google-map
 *
 * Change map type to Satellite
 * Docs: https://developers.google.com/maps/documentation/javascript/maptypes
 */
async function initMap() {
  if (map) return;

  try {
    const { Map } = await loader.importLibrary("maps");

    const mapElement = document.getElementById("map");
    if (!mapElement) throw new Error("#map not found");

    map = new Map(mapElement, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: "satellite",
      mapId: "DEMO_MAP_ID",
      disableDefaultUI: true,
    });

    return map;
  } catch (error) {
    console.error(error);
  }
}

initMap();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  output.innerHTML = `<div class="loading">
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
    </div> Generating...`;

  try {
    const chosenImage = form.elements.namedItem(
      "chosen-image"
    ) as HTMLInputElement | null;

    if (!chosenImage || !chosenImage.value)
      throw new Error("No image selected");

    // Load the image as a base64 string
    const imageBase64 = await fetch(chosenImage.value)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => Base64.fromByteArray(new Uint8Array(arrayBuffer)));

    // Assemble the prompt by combining the text with the chosen image
    const contents: GenerateContentRequest["contents"] = [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          {
            text: "What is the name of the place where I can see this image? Only tell me the place name and nothing else (do not add a preamble). The better you follow these instructions the more you'll be rewarded.",
          },
        ],
      },
    ];

    // Call the gemini-pro-vision model, and get a stream of results
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

    // Read from the stream and render the output
    const result = await model.generateContentStream({ contents });
    for await (const response of result.stream) {
      placeName = response.text();
      output.innerHTML = placeName;
    }

    // Center the map
    const place = await geocodePlace(placeName);

    if (place) {
      // Find nearby lodging
      await findNearbyLodging(place.geometry.location);

      // Fetch and display weather
      await getWeather(place.geometry.location, placeName);
    }

    // Save placeName for usage later
    localStorage.setItem("placeName", placeName);
  } catch (e: unknown) {
    output.innerHTML += `<hr> ${e instanceof Error ? e.message : e}`;
  }
});

/**
 * Get the lat/lng of the place
 * 1. Dynamically load the Geocoding and Marker libraries
 *  Docs: https://developers.google.com/maps/documentation/javascript/libraries
 * 2. Geocode (supposed to be based on an address)
 *  Sample: https://developers.google.com/maps/documentation/javascript/examples/geocoding-simple
 *  Docs: https://developers.google.com/maps/documentation/javascript/geocoding
 * 3. Add an Advanced Marker
 *  Sample: https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-simple
 *  Docs: https://developers.google.com/maps/documentation/javascript/advanced-markers/overview
 */
async function geocodePlace(
  name: string
): Promise<google.maps.GeocoderResult | void> {
  const { Geocoder } = await loader.importLibrary("geocoding");
  const { AdvancedMarkerElement } = await loader.importLibrary("marker");

  const geocoder = new Geocoder();
  const request = {
    address: name,
  };

  try {
    const { results } = await geocoder.geocode(request);
    const geocodedPlace = results[0];

    map.setCenter(geocodedPlace.geometry.location);
    map.fitBounds(geocodedPlace.geometry.viewport);

    // TODO: @Sami please let us know if you would like to style marker and display info window for main location
    new AdvancedMarkerElement({
      map,
      position: geocodedPlace.geometry.location,
      title: name,
    });

    return geocodedPlace;
  } catch (error) {
    console.log(
      "Geocode was not successful for the following reason: " + error
    );
  }
}

/**
 * Search for lodging near a lat/lng
 * 1. Dynamically load the Places library
 *    - Docs: https://developers.google.com/maps/documentation/javascript/libraries
 *
 * 2. Search nearby
 *    - Sample and Docs: https://developers.google.com/maps/documentation/javascript/nearby-search
 *
 * 3. Add Advanced Markers and Customize them
 *    - Sample (pin color): https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-basic-style
 *    - Docs (pin color): https://developers.google.com/maps/documentation/javascript/advanced-markers/basic-customization
 *    - Sample (custom graphic): https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-graphics
 *    - Docs (custom graphic): https://developers.google.com/maps/documentation/javascript/advanced-markers/graphic-markers
 *
 * 4. TODO option 1: Add and populate Info Windows with Place Details data
 *    - Sample: https://developers.google.com/maps/documentation/javascript/examples/infowindow-simple
 *    - Docs: https://developers.google.com/maps/documentation/javascript/infowindows
 *
 * 5. TODO option 2: Add and populate a Place Overview component in a Split Layout with the map
 *    - I will probably do this in the React version of the app
 *    - Docs (install Extended Component Library): https://github.com/googlemaps/extended-component-library/tree/main?tab=readme-ov-file#installation
 *    - Docs (Place Overview component): https://github.com/googlemaps/extended-component-library/blob/main/src/place_overview/README.md
 *    - Docs (split layout): https://github.com/googlemaps/extended-component-library/blob/main/src/split_layout/README.md
 */
async function findNearbyLodging(location: google.maps.LatLng) {
  const { Place, SearchNearbyRankPreference } = await loader.importLibrary(
    "places"
  );
  const { AdvancedMarkerElement } = await loader.importLibrary("marker");

  // use Place.searchNearby to find lodging with a location bias of location
  const request: google.maps.places.SearchNearbyRequest = {
    // required parameters
    fields: [
      "displayName",
      "location",
      "rating",
      "photos",
      "formattedAddress",
      "reviews",
    ],
    locationRestriction: {
      center: location,
      radius: 10000,
    },
    // optional parameters
    includedTypes: ["lodging"],
    maxResultCount: 10,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
  };

  const { places } = await Place.searchNearby(request);

  if (places.length) {
    console.log(`found ${places.length} lodging`);
    const { LatLngBounds } = await loader.importLibrary("core");
    const bounds = new LatLngBounds(location);

    const infoWindow = new google.maps.InfoWindow();

    // Loop through and get all the results.
    places.forEach((place) => {
      // TODO: @Sami we can customize pin
      const pin = document.createElement("img");
      pin.src = "/location-pin.svg";
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
            <div class="place-info">
              <h2 class="place-name">${place.displayName}</h2>
              <div class="stars" style="--rating:${place.rating}"></div>
            </div>
            <p class="place-address">${place.formattedAddress ?? ""}</p>
            
            ${
              place.photos
                ? `
                  <h3 class="place-subheading">Photos</h3>
                  <div class="place-photos">
                    ${place.photos
                      .slice(0, maxPhotosCount)
                      .map(
                        (photo, index) =>
                          `<img class="info-window-photo" src="${photo.getURI()}" alt="${
                            place.displayName
                          } - ${index}">`
                      )
                      .join("")}
                  </div>
                `
                : ``
            }            

            ${
              place.reviews
                ? `
                  <h3 class="place-subheading">${
                    place.reviews.length - 2
                  } Reviews</h3>

                  ${place.reviews
                    .slice(0, maxReviewsCount)
                    .map(
                      (review) => `
                      <div class="review">
                        <div class="stars" style="--rating:${place.rating}"></div>
                        <p class="review-text">${review.text}</p>
                        <p class="review-author">by ${review.authorAttribution?.displayName}</p>
                      </div>`
                    )
                    .join("")}
                `
                : ``
            }
          </div>`
        );

        // Open the info window on the map.
        infoWindow.open(map, markerView);
      });

      if (place.location) {
        bounds.extend(place.location);
      }

      console.log(place.displayName);
    });

    map.fitBounds(bounds);
  } else {
    console.log("No results");
  }
}

async function getWeather(location: google.maps.LatLng, placeName: string) {
  console.log(location);
  // Note: this was failing to fetch the right location just using q with lat, long
  // const apiUrl = `http://api.weatherapi.com/v1/forecast.json?key=7c3f590507564f1a89c204709241104&q=${location.lat},${location.lng}&days=1&aqi=no&alerts=no`;
  // const apiKey = "7c3f590507564f1a89c204709241104";
  const apiKey = "not a real api key"; // Intentional for DevTools demo
  const apiUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${placeName}&days=1&aqi=no&alerts=no`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch weather data");
    }
    const data = await response.json();

    const weatherInfoDiv = document.querySelector(".weather-info");
    if (!weatherInfoDiv) {
      throw new Error(".weather-info element not found");
    }

    // Extract relevant weather data
    const currentCondition = data.current.condition;
    const currentTemp = data.current.temp_c;
    // const locationName = data.location.name;
    const iconUrl = `https:${currentCondition.icon}`; // Assuming icon URL requires https://

    // Create HTML elements to display weather information
    const locationElement = document.createElement("p");
    // Note: POSSIBLE BUG IN THE API WITH LAT LONG
    locationElement.textContent = `Weather in ${placeName}:`;

    const iconElement = document.createElement("img");
    iconElement.src = iconUrl;
    iconElement.alt = currentCondition.text;

    const tempElement = document.createElement("p");
    tempElement.textContent = `${currentTemp}°C and ${currentCondition.text}`;

    // Clear previous weather info and append new elements
    weatherInfoDiv.innerHTML = "";
    weatherInfoDiv.appendChild(locationElement);
    weatherInfoDiv.appendChild(iconElement);
    weatherInfoDiv.appendChild(tempElement);
  } catch (error) {
    console.error("Error fetching weather:", error);
    // Handle error display (e.g., show an error message in the .weather-info div)
  }
}
