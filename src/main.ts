import {
  GenerateContentRequest,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { Loader } from "@googlemaps/js-api-loader";
import "./style.css";

const GEMINI_API_KEY = "AIzaSyBK88lzuqZvl7EvL9qm1he1BiI7arO8mBY";
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

// Add a map
// Sample: https://developers.google.com/maps/documentation/javascript/examples/map-simple
// Docs: https://developers.google.com/maps/documentation/javascript/adding-a-google-map
// Change map type to Satellite
// Docs: https://developers.google.com/maps/documentation/javascript/maptypes
async function initMap() {
  if (map) return;

  try {
    const { Map } = await loader.importLibrary("maps");
    map = new Map(document.getElementById("map")!, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: "satellite",
      mapId: "DEMO_MAP_ID",
    });

    return map;
  } catch (error) {
    console.error(error);
  }
}

initMap();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  output.textContent = "Generating...";

  try {
    const chosenImage = form.elements.namedItem(
      "chosen-image"
    ) as HTMLInputElement | null;

    if (!chosenImage || !chosenImage.value)
      throw new Error("No image selected");

    const imageUrl = chosenImage.value;
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const imageBase64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

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

    const result = await model.generateContentStream({ contents });
    for await (const response of result.stream) {
      placeName = response.text();
      output.innerHTML = placeName;
    }

    await geocodePlace(placeName);
  } catch (e: unknown) {
    output.innerHTML += `<hr> + ${e instanceof Error ? e.message : e}`;
  }
});

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
    const markerView = new AdvancedMarkerElement({
      map,
      position: geocodedPlace.geometry.location,
      title: name,
    });

    findNearbyLodging(geocodedPlace.geometry.location);
  } catch (error) {
    console.log(
      "Geocode was not successful for the following reason: " + error
    );
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
  const { Place, SearchNearbyRankPreference } = await loader.importLibrary(
    "places"
  );
  const { AdvancedMarkerElement, PinElement } = await loader.importLibrary(
    "marker"
  );

  // use Place.searchNearby to find lodging with a location bias of location
  const request = {
    // required parameters
    fields: ["displayName", "location", "rating"],
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
    const bounds = new LatLngBounds();
    bounds.extend(location);

    // Loop through and get all the results.
    places.forEach((place) => {
      // Change the background color of the results pins.
      const lodgingPin = new PinElement({
        background: "#FBBC04",
        scale: 0.75,
      });

      const markerView = new AdvancedMarkerElement({
        map,
        position: place.location,
        title: `${place.displayName}, ${place.rating} stars`,
        content: lodgingPin.element,
      });

      bounds.extend(place.location!);
      console.log(place.displayName);
    });

    map?.fitBounds(bounds);
  } else {
    console.log("No results");
  }
}
