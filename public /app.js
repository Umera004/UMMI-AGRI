"use strict";

const state = {
  token: localStorage.getItem("ummi_token"),
  user: null,
  crops: [],
  listings: [],
  editingCropId: null,
  editingListingId: null
};

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];

/* =========================
   HELPERS
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function setMessage(
  element,
  message,
  type = ""
) {
  if (!element) return;

  element.textContent = message;
  element.className =
    `form-message ${type}`;
}

async function api(
  url,
  options = {}
) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body) {
    headers["Content-Type"] =
      "application/json";
  }

  if (state.token) {
    headers.Authorization =
      `Bearer ${state.token}`;
  }

  const response = await fetch(
    url,
    {
      ...options,
      headers
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (
    response.status === 401 &&
    url !== "/api/auth/login" &&
    url !== "/api/auth/register"
  ) {
    logout(false);
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Something went wrong."
    );
  }

  return data;
}

/* =========================
   MODALS
========================= */

function openModal(element) {
  element.classList.remove("hidden");
  document.body.classList.add(
    "modal-open"
  );
}

function closeModal(element) {
  element.classList.add("hidden");

  if (
    $$(".modal:not(.hidden)").length === 0
  ) {
    document.body.classList.remove(
      "modal-open"
    );
  }
}

function openAuth(
  mode = "login"
) {
  const modal = $("#authModal");

  $("#loginView")
    .classList.toggle(
      "hidden",
      mode !== "login"
    );

  $("#registerView")
    .classList.toggle(
      "hidden",
      mode !== "register"
    );

  setMessage(
    $("#loginMessage"),
    ""
  );

  setMessage(
    $("#registerMessage"),
    ""
  );

  openModal(modal);
}

/* =========================
   LANDING / NAV
========================= */

$$("[data-action='login']")
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => openAuth("login")
    );
  });

$$("[data-action='register']")
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => openAuth("register")
    );
  });

$("#closeAuth")
  .addEventListener(
    "click",
    () =>
      closeModal(
        $("#authModal")
      )
  );

$("#showRegister")
  .addEventListener(
    "click",
    () => openAuth("register")
  );

$("#showLogin")
  .addEventListener(
    "click",
    () => openAuth("login")
  );

$("#mobileMenuButton")
  .addEventListener(
    "click",
    () => {
      $("#mobileNav")
        .classList.toggle(
          "open"
        );
    }
  );

$$(".mobile-nav a")
  .forEach((link) => {
    link.addEventListener(
      "click",
      () => {
        $("#mobileNav")
          .classList.remove(
            "open"
          );
      }
    );
  });

/* =========================
   REGISTER
========================= */

$("#registerForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        $("#registerMessage");

      setMessage(
        message,
        "Creating your account..."
      );

      try {
        const data =
          await api(
            "/api/auth/register",
            {
              method: "POST",
              body: JSON.stringify({
                name:
                  $("#registerName")
                    .value,

                email:
                  $("#registerEmail")
                    .value,

                password:
                  $("#registerPassword")
                    .value,

                phone:
                  $("#registerPhone")
                    .value,

                farmName:
                  $("#registerFarm")
                    .value,

                location:
                  $("#registerLocation")
                    .value
              })
            }
          );

        state.token =
          data.token;

        state.user =
          data.user;

        localStorage.setItem(
          "ummi_token",
          state.token
        );

        setMessage(
          message,
          "Account created successfully.",
          "success"
        );

        showToast(
          "Welcome to UMMI AGRI 🌱"
        );

        setTimeout(
          () => {
            closeModal(
              $("#authModal")
            );

            enterDashboard();
          },
          500
        );
      } catch (error) {
        setMessage(
          message,
          error.message,
          "error"
        );
      }
    }
  );

/* =========================
   LOGIN
========================= */

$("#loginForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        $("#loginMessage");

      setMessage(
        message,
        "Signing you in..."
      );

      try {
        const data =
          await api(
            "/api/auth/login",
            {
              method: "POST",
              body: JSON.stringify({
                email:
                  $("#loginEmail")
                    .value,

                password:
                  $("#loginPassword")
                    .value
              })
            }
          );

        state.token =
          data.token;

        state.user =
          data.user;

        localStorage.setItem(
          "ummi_token",
          state.token
        );

        setMessage(
          message,
          "Login successful.",
          "success"
        );

        showToast(
          "Welcome back 👋"
        );

        setTimeout(
          () => {
            closeModal(
              $("#authModal")
            );

            enterDashboard();
          },
          400
        );
      } catch (error) {
        setMessage(
          message,
          error.message,
          "error"
        );
      }
    }
  );

/* =========================
   AUTH SESSION
========================= */

async function checkSession() {
  if (!state.token) {
    return;
  }

  try {
    const data =
      await api(
        "/api/auth/me"
      );

    state.user =
      data.user;

    await enterDashboard(
      false
    );
  } catch {
    logout(false);
  }
}

/* =========================
   DASHBOARD
========================= */

async function enterDashboard(
  notify = true
) {
  document
    .querySelectorAll(
      ".hero, .features-section, .marketplace-preview, .about-section, .cta-section"
    )
    .forEach(
      (section) =>
        section.classList.add(
          "hidden"
        )
    );

  $("#dashboard")
    .classList.remove(
      "hidden"
    );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  updateUserUI();

  await Promise.all([
    loadDashboard(),
    loadCrops(),
    loadListings()
  ]);

  if (notify) {
    showToast(
      "Dashboard loaded."
    );
  }
}

function updateUserUI() {
  if (!state.user) return;

  $("#dashboardName")
    .textContent =
    state.user.name;

  $("#dashboardFarm")
    .textContent =
    state.user.farmName ||
    "Your farm";

  $("#dashboardLocation")
    .textContent =
    state.user.location ||
    "India";

  $("#profileName")
    .value =
    state.user.name || "";

  $("#profilePhone")
    .value =
    state.user.phone || "";

  $("#profileFarm")
    .value =
    state.user.farmName || "";

  $("#profileLocation")
    .value =
    state.user.location || "";

  $("#accountRole")
    .textContent =
    state.user.role ||
    "Farmer";
}

/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboard() {
  try {
    const data =
      await api(
        "/api/dashboard"
      );

    const dashboard =
      data.dashboard;

    const stats =
      dashboard.statistics;

    const insights =
      dashboard.insights;

    $("#farmHealth")
      .textContent =
      `${dashboard.farmHealth}%`;

    $("#healthBar")
      .style.width =
      `${dashboard.farmHealth}%`;

    $("#cropCount")
      .textContent =
      stats.crops;

    $("#farmArea")
      .textContent =
      stats.totalArea;

    $("#listingCount")
      .textContent =
      stats.listings;

    $("#insightGrowing")
      .textContent =
      insights.growing;

    $("#insightPlanted")
      .textContent =
      insights.planted;

    $("#insightReady")
      .textContent =
      insights.ready;

    $("#insightHarvested")
      .textContent =
      insights.harvested;

    $("#insightAttention")
      .textContent =
      insights.attention;

    renderWeather(
      dashboard.weather
    );
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* =========================
   WEATHER
========================= */

function weatherIcon(
  condition
) {
  const text =
    String(condition)
      .toLowerCase();

  if (
    text.includes("thunder")
  ) {
    return "⛈️";
  }

  if (
    text.includes("rain") ||
    text.includes("drizzle") ||
    text.includes("shower")
  ) {
    return "🌧️";
  }

  if (
    text.includes("cloud")
  ) {
    return "⛅";
  }

  if (
    text.includes("fog")
  ) {
    return "🌫️";
  }

  return "☀️";
}

function renderWeather(
  weather
) {
  if (!weather) return;

  $("#weatherTemperature")
    .textContent =
    weather.available
      ? `${weather.temperature}°`
      : "--°";

  $("#weatherCondition")
    .textContent =
    weather.condition ||
    "Weather unavailable";

  $("#weatherLocation")
    .textContent =
    weather.location ||
    "Unknown location";

  $("#weatherHumidity")
    .textContent =
    weather.humidity ??
    "--";

  $("#weatherWind")
    .textContent =
    weather.wind ??
    "--";

  $("#weatherSymbol")
    .textContent =
    weatherIcon(
      weather.condition
    );

  const forecast =
    $("#weatherForecast");

  if (
    !weather.forecast ||
    !weather.forecast.length
  ) {
    forecast.innerHTML = "";
    return;
  }

  forecast.innerHTML =
    weather.forecast
      .map((item) => {
        const date =
          new Date(
            `${item.date}T12:00:00`
          );

        const day =
          date.toLocaleDateString(
            undefined,
            {
              weekday: "short"
            }
          );

        return `
          <div class="forecast-item">
            <small>${escapeHtml(day)}</small>
            <strong>${item.max}° / ${item.min}°</strong>
            <span>${item.rain}% rain</span>
          </div>
        `;
      })
      .join("");
}

/* =========================
   CROPS
========================= */

async function loadCrops() {
  try {
    const data =
      await api(
        "/api/crops"
      );

    state.crops =
      data.crops || [];

    renderCrops();
  } catch (error) {
    showToast(
      error.message
    );
  }
}

function renderCrops() {
  const container =
    $("#cropList");

  if (!state.crops.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No crops yet</strong>
        Add your first crop to start tracking your farm.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.crops
      .map(
        (crop) => `
        <div class="crop-card">

          <div class="crop-card-top">

            <div>
              <h4>
                ${escapeHtml(crop.name)}
              </h4>

              <div class="crop-variety">
                ${
                  escapeHtml(
                    crop.variety ||
                    "No variety specified"
                  )
                }
              </div>
            </div>

            <span class="crop-status">
              ${escapeHtml(crop.status)}
            </span>

          </div>

          <div class="crop-details">

            <div class="crop-detail">
              <small>Area</small>
              <b>
                ${escapeHtml(crop.area)}
                ${escapeHtml(crop.unit)}
              </b>
            </div>

            <div class="crop-detail">
              <small>Planted</small>
              <b>
                ${
                  crop.plantedDate ||
                  "Not set"
                }
              </b>
            </div>

            <div class="crop-detail">
              <small>Harvest</small>
              <b>
                ${
                  crop.expectedHarvest ||
                  "Not set"
                }
              </b>
            </div>

            <div class="crop-detail">
              <small>Notes</small>
              <b>
                ${
                  crop.notes
                    ? escapeHtml(
                        crop.notes
                      ).slice(0, 22) +
                      (
                        crop.notes.length > 22
                          ? "..."
                          : ""
                      )
                    : "—"
                }
              </b>
            </div>

          </div>

          <div class="crop-actions">

            <button
              class="action-button"
              data-edit-crop="${crop.id}"
            >
              Edit
            </button>

            <button
              class="action-button delete"
              data-delete-crop="${crop.id}"
            >
              Delete
            </button>

          </div>

        </div>
      `
      )
      .join("");

  $$("[data-edit-crop]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          openCropEditor(
            Number(
              button.dataset.editCrop
            )
          )
      );
    });

  $$("[data-delete-crop]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          deleteCrop(
            Number(
              button.dataset.deleteCrop
            )
          )
      );
    });
}

/* =========================
   CROP MODAL
========================= */

$("#addCropButton")
  .addEventListener(
    "click",
    () =>
      openCropEditor(null)
  );

$("#closeCrop")
  .addEventListener(
    "click",
    () =>
      closeModal(
        $("#cropModal")
      )
  );

$("#cancelCrop")
  .addEventListener(
    "click",
    () =>
      closeModal(
        $("#cropModal")
      )
  );

function openCropEditor(
  id
) {
  state.editingCropId =
    id;

  const crop =
    id
      ? state.crops.find(
          (item) =>
            item.id === id
        )
      : null;

  $("#cropModalTitle")
    .textContent =
    crop
      ? "Edit crop"
      : "Add a crop";

  $("#cropId")
    .value =
    crop?.id || "";

  $("#cropName")
    .value =
    crop?.name || "";

  $("#cropVariety")
    .value =
    crop?.variety || "";

  $("#cropArea")
    .value =
    crop?.area ?? "";

  $("#cropUnit")
    .value =
    crop?.unit || "acres";

  $("#cropStatus")
    .value =
    crop?.status || "Growing";

  $("#cropPlanted")
    .value =
    crop?.plantedDate || "";

  $("#cropHarvest")
    .value =
    crop?.expectedHarvest || "";

  $("#cropNotes")
    .value =
    crop?.notes || "";

  setMessage(
    $("#cropMessage"),
    ""
  );

  openModal(
    $("#cropModal")
  );
}

$("#cropForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        $("#cropMessage");

      setMessage(
        message,
        "Saving crop..."
      );

      const body = {
        name:
          $("#cropName").value,

        variety:
          $("#cropVariety").value,

        area:
          $("#cropArea").value,

        unit:
          $("#cropUnit").value,

        status:
          $("#cropStatus").value,

        plantedDate:
          $("#cropPlanted").value,

        expectedHarvest:
          $("#cropHarvest").value,

        notes:
          $("#cropNotes").value
      };

      try {
        if (
          state.editingCropId
        ) {
          await api(
            `/api/crops/${state.editingCropId}`,
            {
              method: "PUT",
              body: JSON.stringify(body)
            }
          );

          showToast(
            "Crop updated."
          );
        } else {
          await api(
            "/api/crops",
            {
              method: "POST",
              body: JSON.stringify(body)
            }
          );

          showToast(
            "Crop added 🌱"
          );
        }

        closeModal(
          $("#cropModal")
        );

        await Promise.all([
          loadCrops(),
          loadDashboard()
        ]);
      } catch (error) {
        setMessage(
          message,
          error.message,
          "error"
        );
      }
    }
  );

async function deleteCrop(
  id
) {
  const crop =
    state.crops.find(
      (item) => item.id === id
    );

  if (!crop) return;

  const confirmed =
    window.confirm(
      `Delete ${crop.name}?`
    );

  if (!confirmed) return;

  try {
    await api(
      `/api/crops/${id}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Crop deleted."
    );

    await Promise.all([
      loadCrops(),
      loadDashboard()
    ]);
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* =========================
   LISTINGS
========================= */

async function loadListings() {
  try {
    const params =
      new URLSearchParams();

    const search =
      $("#marketSearch").value
        .trim();

    const category =
      $("#marketCategory").value;

    if (search) {
      params.set(
        "search",
        search
      );
    }

    if (
      category &&
      category !== "all"
    ) {
      params.set(
        "category",
        category
      );
    }

    const query =
      params.toString();

    const data =
      await api(
        `/api/listings${
          query
            ? `?${query}`
            : ""
        }`
      );

    state.listings =
      data.listings || [];

    renderListings();
  } catch (error) {
    showToast(
      error.message
    );
  }
}

function renderListings() {
  const container =
    $("#listingList");

  if (!state.listings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>No marketplace listings</strong>
        Try another search or publish your first product.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.listings
      .map(
        (listing) => `
        <div class="listing-card">

          <div class="listing-card-top">

            <span class="category-tag">
              ${escapeHtml(
                listing.category
              )}
            </span>

            ${
              listing.userId ===
              state.user?.id
                ? `
                  <span
                    class="category-tag"
                    title="Your listing"
                  >
                    Yours
                  </span>
                `
                : ""
            }

          </div>

          <h4>
            ${escapeHtml(
              listing.title
            )}
          </h4>

          <p class="listing-description">
            ${
              escapeHtml(
                listing.description ||
                "No description provided."
              )
            }
          </p>

          <div class="listing-meta">

            <div>
              <small>Quantity</small>
              <b>
                ${escapeHtml(
                  listing.quantity
                )}
                ${escapeHtml(
                  listing.unit
                )}
              </b>
            </div>

            <div>
              <small>Price</small>
              <b>
                ₹${Number(
                  listing.price || 0
                ).toLocaleString("en-IN")}
              </b>
            </div>

            <div>
              <small>Location</small>
              <b>
                ${escapeHtml(
                  listing.location
                )}
              </b>
            </div>

            <div>
              <small>Seller</small>
              <b>
                ${escapeHtml(
                  listing.sellerName
                )}
              </b>
            </div>

          </div>

          ${
            listing.userId ===
            state.user?.id
              ? `
                <div class="listing-actions">

                  <button
                    class="action-button"
                    data-edit-listing="${listing.id}"
                  >
                    Edit
                  </button>

                  <button
                    class="action-button delete"
                    data-delete-listing="${listing.id}"
                  >
                    Delete
                  </button>

                </div>
              `
              : ""
          }

        </div>
      `
      )
      .join("");

  $$("[data-edit-listing]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          openListingEditor(
            Number(
              button.dataset.editListing
            )
          )
      );
    });

  $$("[data-delete-listing]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          deleteListing(
            Number(
              button.dataset.deleteListing
            )
          )
      );
    });
}

let marketSearchTimer;

$("#marketSearch")
  .addEventListener(
    "input",
    () => {
      clearTimeout(
        marketSearchTimer
      );

      marketSearchTimer =
        setTimeout(
          loadListings,
          300
        );
    }
  );

$("#marketCategory")
  .addEventListener(
    "change",
    loadListings
  );

/* =========================
   LISTING MODAL
========================= */

$("#addListingButton")
  .addEventListener(
    "click",
    () =>
      openListingEditor(null)
  );

$("#closeListing")
  .addEventListener(
    "click",
    () =>
      closeModal(
        $("#listingModal")
      )
  );

$("#cancelListing")
  .addEventListener(
    "click",
    () =>
      closeModal(
        $("#listingModal")
      )
  );

function openListingEditor(
  id
) {
  state.editingListingId =
    id;

  const listing =
    id
      ? state.listings.find(
          (item) =>
            item.id === id
        )
      : null;

  if (
    listing &&
    listing.userId !==
      state.user?.id
  ) {
    showToast(
      "You can only edit your own listings."
    );

    return;
  }

  $("#listingModalTitle")
    .textContent =
    listing
      ? "Edit product"
      : "Sell a product";

  $("#listingId")
    .value =
    listing?.id || "";

  $("#listingTitle")
    .value =
    listing?.title || "";

  $("#listingCategory")
    .value =
    listing?.category ||
    "Vegetables";

  $("#listingQuantity")
    .value =
    listing?.quantity ?? "";

  $("#listingUnit")
    .value =
    listing?.unit || "kg";

  $("#listingPrice")
    .value =
    listing?.price ?? "";

  $("#listingLocation")
    .value =
    listing?.location ||
    state.user?.location ||
    "";

  $("#listingDescription")
    .value =
    listing?.description || "";

  setMessage(
    $("#listingMessage"),
    ""
  );

  openModal(
    $("#listingModal")
  );
}

$("#listingForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        $("#listingMessage");

      setMessage(
        message,
        "Saving listing..."
      );

      const body = {
        title:
          $("#listingTitle").value,

        category:
          $("#listingCategory").value,

        quantity:
          $("#listingQuantity").value,

        unit:
          $("#listingUnit").value,

        price:
          $("#listingPrice").value,

        location:
          $("#listingLocation").value,

        description:
          $("#listingDescription")
            .value
      };

      try {
        if (
          state.editingListingId
        ) {
          await api(
            `/api/listings/${state.editingListingId}`,
            {
              method: "PUT",
              body: JSON.stringify(body)
            }
          );

          showToast(
            "Listing updated."
          );
        } else {
          await api(
            "/api/listings",
            {
              method: "POST",
              body: JSON.stringify(body)
            }
          );

          showToast(
            "Product published 🛒"
          );
        }

        closeModal(
          $("#listingModal")
        );

        await Promise.all([
          loadListings(),
          loadDashboard()
        ]);
      } catch (error) {
        setMessage(
          message,
          error.message,
          "error"
        );
      }
    }
  );

async function deleteListing(
  id
) {
  const listing =
    state.listings.find(
      (item) => item.id === id
    );

  if (!listing) return;

  if (
    listing.userId !==
    state.user?.id
  ) {
    showToast(
      "You can only delete your own listing."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Delete "${listing.title}"?`
    );

  if (!confirmed) return;

  try {
    await api(
      `/api/listings/${id}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Listing deleted."
    );

    await Promise.all([
      loadListings(),
      loadDashboard()
    ]);
  } catch (error) {
    showToast(
      error.message
    );
  }
}

/* =========================
   PROFILE
========================= */

$("#profileForm")
  .addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        $("#profileMessage");

      setMessage(
        message,
        "Saving profile..."
      );

      try {
        const data =
          await api(
            "/api/auth/profile",
            {
              method: "PUT",
              body: JSON.stringify({
                name:
                  $("#profileName")
                    .value,

                phone:
                  $("#profilePhone")
                    .value,

                farmName:
                  $("#profileFarm")
                    .value,

                location:
                  $("#profileLocation")
                    .value
              })
            }
          );

        state.user =
          data.user;

        updateUserUI();

        setMessage(
          message,
          "Profile saved successfully.",
          "success"
        );

        showToast(
          "Profile updated."
        );

        await loadDashboard();
      } catch (error) {
        setMessage(
          message,
          error.message,
          "error"
        );
      }
    }
  );

/* =========================
   LOGOUT
========================= */

$("#logoutButton")
  .addEventListener(
    "click",
    () => logout(true)
  );

function logout(
  notify = true
) {
  state.token = null;
  state.user = null;
  state.crops = [];
  state.listings = [];

  localStorage.removeItem(
    "ummi_token"
  );

  $("#dashboard")
    .classList.add(
      "hidden"
    );

  document
    .querySelectorAll(
      ".hero, .features-section, .marketplace-preview, .about-section, .cta-section"
    )
    .forEach(
      (section) =>
        section.classList.remove(
          "hidden"
        )
    );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (notify) {
    showToast(
      "You have been logged out."
    );
  }
}

/* =========================
   ESCAPE MODALS
========================= */

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape"
    ) {
      $$(".modal:not(.hidden)")
        .forEach(
          closeModal
        );
    }
  }
);

/* =========================
   FOOTER
========================= */

$("#footerYear")
  .textContent =
  new Date().getFullYear();

/* =========================
   START
========================= */

checkSession();
