import {
  GenerateContentRequest,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import "@googlemaps/extended-component-library/api_loader.js";
import { APILoader } from "@googlemaps/extended-component-library/api_loader.js";
import "@googlemaps/extended-component-library/place_overview.js";
import { PlaceOverview } from "@googlemaps/extended-component-library/place_overview.js";
import "@googlemaps/extended-component-library/split_layout.js";
import { SplitLayout } from "@googlemaps/extended-component-library/split_layout.js";
import Base64 from "base64-js";
import "./style.css";

// TODO: rewrite to mention integrations panel?
// 🔥 FILL THIS OUT FIRST! 🔥
// 🔥 GET YOUR GEMINI API KEY AT 🔥
// 🔥 https://g.co/ai/idxGetGeminiKey 🔥
const GEMINI_API_KEY = "AIzaSyBK88lzuqZvl7EvL9qm1he1BiI7arO8mBY";

// TODO: rewrite to mention integrations panel?
// Open the Integrations panel to Enable the Maps JavaScript API
// Get your Maps and Places API key at https://goo.gle/js-api-key
// Be sure to enable Maps JavaScript API, Geocoding API, and Places API (New)
const MAPS_API_KEY = "AIzaSyDe61wuiQ3lr8AL9FSxhVTanI4pyD7sG28";

const form: HTMLFormElement | null = document.querySelector("form");
if (!form) {
  throw new Error("form not found");
}

const output: HTMLElement | null = document.querySelector(".output");
if (!output) {
  throw new Error(".output not found");
}

const loader = document.createElement("gmpx-api-loader") as APILoader;
loader.key = MAPS_API_KEY;
loader.solutionChannel = "GMP_idx_template_gemini_map";
loader.version = "alpha";
document.body.appendChild(loader);

// @ts-ignore
// prettier-ignore
const { Map3DElement } = (await APILoader.importLibrary("maps3d")) as google.maps.Maps3DLibrary;
// @ts-ignore
const map: Map3DElement = initMap();
let placeName = "";

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
            text: "What is the name of the place where I can see this image? Only tell me the place name and nothing else (do not add a preamble) so that I can provide the name as an address input for geocoding. The better you follow these instructions the more you'll be rewarded.",
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
    }
  } catch (e: unknown) {
    output.innerHTML += `<hr> ${e instanceof Error ? e.message : e}`;
  }
});

/**
 * Add a map
 * Sample: https://developers.google.com/maps/documentation/javascript/examples/map-simple
 * Docs: https://developers.google.com/maps/documentation/javascript/adding-a-google-map
 */
function initMap() {
  // if (map) return;

  try {
    const mapElement = document.getElementById("map");
    if (!mapElement) throw new Error("#map not found");

    // Add a 3D map (Experimental)
    // Documentation to be published May 14
    const map = new Map3DElement({
      center: {
        lat: 37.42563380992334,
        lng: -122.07880664230917,
        altitude: 80,
      },
      tilt: 75,
      heading: -50,
    });

    mapElement.appendChild(map);
    return map;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get the lat/lng of the place
 * 1. Dynamically load the Geocoding library
 *  Docs: https://developers.google.com/maps/documentation/javascript/libraries
 * 2. Geocode (supposed to be based on an address)
 *  Sample: https://developers.google.com/maps/documentation/javascript/examples/geocoding-simple
 *  Docs: https://developers.google.com/maps/documentation/javascript/geocoding
 */
async function geocodePlace(
  name: string
): Promise<google.maps.GeocoderResult | void> {
  // prettier-ignore
  const { Geocoder } = (await APILoader.importLibrary("geocoding")) as google.maps.GeocodingLibrary;

  const geocoder = new Geocoder();
  const request = {
    address: name,
  };

  try {
    // prettier-ignore
    const { LatLngAltitude } = (await APILoader.importLibrary("core")) as google.maps.CoreLibrary;
    const { results } = await geocoder.geocode(request);
    const geocodedPlace = results[0];

    const newCenter = new LatLngAltitude({
      lat: geocodedPlace.geometry.location.lat() - 0.005,
      lng: geocodedPlace.geometry.location.lng(),
      altitude: 200,
    });
    map.center = newCenter;
    map.heading = 0;

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
 */
async function findNearbyLodging(location: google.maps.LatLng) {
  // prettier-ignore
  const { Place, SearchNearbyRankPreference } = (await APILoader.importLibrary("places")) as google.maps.PlacesLibrary;

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

    addResults(places);
  } else {
    console.log("No results");
  }
}

// Add and populate a Place Overview component in a Split Layout with the map
// Documentation (install Extended Component Library): https://github.com/googlemaps/extended-component-library/tree/maine#installation
// Documentation (Split Layout): https://github.com/googlemaps/extended-component-library/blob/main/src/split_layout
async function addResults(places: google.maps.places.Place[]) {
  const oldFixedElement = document.getElementById("fixed-panel");
  oldFixedElement?.remove();
  const layoutElement = document.getElementById("split-layout") as SplitLayout;
  if (!layoutElement) throw new Error("#split-layout not found");
  const fixedElement = document.createElement("div");
  fixedElement.id = "fixed-panel";
  fixedElement.slot = "fixed";
  layoutElement.appendChild(fixedElement);
  layoutElement.classList.add("results");

  const results: PlaceOverview[] = [];

  // Loop through and get all the results.
  places.forEach(async (place) => {
    console.log(place.id);

    // Add a Place Overview component card in a clickable button for each search result
    // Documentation: https://github.com/googlemaps/extended-component-library/blob/main/src/place_overview
    const resultButton = document.createElement("button");
    // prettier-ignore
    const placeComponent = document.createElement("gmpx-place-overview") as PlaceOverview;
    placeComponent.place = place.id;
    placeComponent.size = "small";
    placeComponent.travelOrigin = place.location ?? undefined;
    placeComponent.travelMode = "bicycling";
    placeComponent.googleLogoAlreadyDisplayed = true;
    console.log(placeComponent);
    results.push(placeComponent);
    resultButton.classList.add("resultButton");
    resultButton.addEventListener("click", () => resultClick(place.location));
    resultButton.appendChild(placeComponent);
    fixedElement.appendChild(resultButton);

    console.log(place.displayName);
  });

  console.log(results);
  console.log(layoutElement);
}

async function resultClick(location: google.maps.LatLng | null | undefined) {
  if (!location) return;

  // prettier-ignore
  const { LatLngAltitude } = (await APILoader.importLibrary("core")) as google.maps.CoreLibrary;
  const newCenter = new LatLngAltitude({
    lat: location.lat(),
    lng: location.lng() + 0.002,
    altitude: 80,
  });
  map.center = newCenter;
  map.heading = -90;
}
