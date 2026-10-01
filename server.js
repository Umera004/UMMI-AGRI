"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 10000;
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "ummi-agri-development-secret-change-this";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const PUBLIC_DIR = path.join(__dirname, "public");

/* ================================
   DATABASE
================================ */

function defaultDatabase() {
  return {
    users: [],
    crops: [],
    listings: []
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(defaultDatabase(), null, 2),
      "utf8"
    );
  }
}

ensureDatabase();

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (error) {
    console.error("Database read error:", error);
    return defaultDatabase();
  }
}

function writeDatabase(database) {
  const temporaryFile = `${DB_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(database, null, 2),
    "utf8"
  );

  fs.renameSync(temporaryFile, DB_FILE);
}

function nextId(items) {
  if (!items.length) return 1;

  return (
    Math.max(
      ...items.map((item) => Number(item.id) || 0)
    ) + 1
  );
}

/* ================================
   HELPERS
================================ */

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function email(value) {
  return clean(value).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function numberValue(value, fallback = 0) {
  const result = Number(value);

  return Number.isFinite(result) ? result : fallback;
}

/* ================================
   PASSWORD HASHING
================================ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  try {
    const parts = storedPassword.split(":");

    if (parts.length !== 2) {
      return false;
    }

    const salt = parts[0];
    const storedHash = parts[1];

    const hash = crypto
      .scryptSync(password, salt, 64)
      .toString("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}

/* ================================
   PUBLIC USER
================================ */

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    farmName: user.farmName || "",
    location: user.location || "",
    role: user.role || "Farmer",
    createdAt: user.createdAt
  };
}

/* ================================
   JWT
================================ */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function authenticate(req, res, next) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  try {
    const token = authorization.slice(7);

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    const database = readDatabase();

    const user = database.users.find(
      (item) => item.id === decoded.id
    );

    if (!user) {
      return res.status(401).json({
        message: "User account was not found."
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      message:
        "Your session has expired. Please sign in again."
    });
  }
}

/* ================================
   SECURITY
================================ */

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

/* ================================
   HEALTH
================================ */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "UMMI AGRI",
    version: "1.0.0",
    node: process.version,
    time: new Date().toISOString()
  });
});

/* ================================
   AUTH REGISTER
================================ */

app.post(
  "/api/auth/register",
  authLimiter,
  (req, res) => {
    const name = clean(req.body.name);
    const userEmail = email(req.body.email);
    const password = req.body.password;

    if (!name) {
      return res.status(400).json({
        message: "Please enter your name."
      });
    }

    if (!validEmail(userEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          "Password must contain at least 8 characters."
      });
    }

    const database = readDatabase();

    const existing = database.users.find(
      (user) => user.email === userEmail
    );

    if (existing) {
      return res.status(409).json({
        message:
          "An account with this email already exists."
      });
    }

    const user = {
      id: nextId(database.users),
      name,
      email: userEmail,
      password: hashPassword(password),
      phone: clean(req.body.phone),
      farmName: clean(req.body.farmName),
      location: clean(req.body.location),
      role: "Farmer",
      createdAt: new Date().toISOString()
    };

    database.users.push(user);

    writeDatabase(database);

    res.status(201).json({
      message: "Account created successfully.",
      token: createToken(user),
      user: publicUser(user)
    });
  }
);

/* ================================
   AUTH LOGIN
================================ */

app.post(
  "/api/auth/login",
  authLimiter,
  (req, res) => {
    const userEmail = email(req.body.email);
    const password = req.body.password || "";

    const database = readDatabase();

    const user = database.users.find(
      (item) => item.email === userEmail
    );

    if (
      !user ||
      !verifyPassword(
        password,
        user.password
      )
    ) {
      return res.status(401).json({
        message: "Incorrect email or password."
      });
    }

    res.json({
      message: "Login successful.",
      token: createToken(user),
      user: publicUser(user)
    });
  }
);

/* ================================
   CURRENT USER
================================ */

app.get(
  "/api/auth/me",
  authenticate,
  (req, res) => {
    res.json({
      user: publicUser(req.user)
    });
  }
);

/* ================================
   PROFILE
================================ */

app.put(
  "/api/auth/profile",
  authenticate,
  (req, res) => {
    const database = readDatabase();

    const user = database.users.find(
      (item) => item.id === req.user.id
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    for (const field of [
      "name",
      "phone",
      "farmName",
      "location"
    ]) {
      if (req.body[field] !== undefined) {
        user[field] = clean(req.body[field]);
      }
    }

    if (!user.name) {
      return res.status(400).json({
        message: "Name is required."
      });
    }

    user.updatedAt =
      new Date().toISOString();

    writeDatabase(database);

    res.json({
      message: "Profile updated.",
      user: publicUser(user)
    });
  }
);

/* ================================
   WEATHER
================================ */

const weatherDescriptions = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm"
};

async function getWeather(location) {
  const searchLocation =
    clean(location) || "Bengaluru";

  try {
    const geoResponse = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?" +
        `name=${encodeURIComponent(searchLocation)}` +
        "&count=1&language=en&format=json"
    );

    if (!geoResponse.ok) {
      throw new Error("Geocoding failed.");
    }

    const geoData =
      await geoResponse.json();

    if (!geoData.results?.length) {
      throw new Error("Location not found.");
    }

    const place = geoData.results[0];

    const weatherResponse = await fetch(
      "https://api.open-meteo.com/v1/forecast?" +
        `latitude=${place.latitude}` +
        `&longitude=${place.longitude}` +
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
        "&timezone=auto"
    );

    if (!weatherResponse.ok) {
      throw new Error("Weather request failed.");
    }

    const weather =
      await weatherResponse.json();

    return {
      available: true,
      location: place.name,
      country: place.country || "",
      temperature: Math.round(
        weather.current.temperature_2m
      ),
      humidity:
        weather.current.relative_humidity_2m,
      wind: Math.round(
        weather.current.wind_speed_10m
      ),
      condition:
        weatherDescriptions[
          weather.current.weather_code
        ] || "Variable weather",
      forecast:
        (weather.daily?.time || [])
          .slice(0, 5)
          .map((date, index) => ({
            date,
            max:
              Math.round(
                weather.daily
                  .temperature_2m_max[index]
              ),
            min:
              Math.round(
                weather.daily
                  .temperature_2m_min[index]
              ),
            rain:
              weather.daily
                .precipitation_probability_max[index]
          }))
    };
  } catch (error) {
    console.error("Weather error:", error);

    return {
      available: false,
      location: searchLocation,
      temperature: null,
      humidity: null,
      wind: null,
      condition: "Weather unavailable",
      forecast: []
    };
  }
}

/* ================================
   DASHBOARD
================================ */

app.get(
  "/api/dashboard",
  authenticate,
  async (req, res) => {
    const database = readDatabase();

    const user =
      database.users.find(
        (item) => item.id === req.user.id
      );

    const crops =
      database.crops.filter(
        (crop) =>
          crop.userId === user.id
      );

    const ownListings =
      database.listings.filter(
        (listing) =>
          listing.userId === user.id
      );

    const totalArea =
      crops.reduce(
        (total, crop) =>
          total + numberValue(crop.area),
        0
      );

    const healthy =
      crops.filter((crop) =>
        [
          "Growing",
          "Planted",
          "Ready for harvest"
        ].includes(crop.status)
      ).length;

    const farmHealth = crops.length
      ? Math.round(
          (healthy / crops.length) * 100
        )
      : 100;

    const harvested =
      crops.filter(
        (crop) =>
          crop.status === "Harvested"
      ).length;

    const upcoming =
      crops.filter(
        (crop) => crop.expectedHarvest
      ).length;

    const marketplace =
      database.listings.length;

    res.json({
      dashboard: {
        user: publicUser(user),

        farmHealth,

        statistics: {
          crops: crops.length,
          totalArea:
            Number(totalArea.toFixed(2)),
          listings:
            ownListings.length,
          marketplace,
          harvested,
          upcoming
        },

        insights: {
          growing:
            crops.filter(
              (crop) =>
                crop.status === "Growing"
            ).length,

          planted:
            crops.filter(
              (crop) =>
                crop.status === "Planted"
            ).length,

          ready:
            crops.filter(
              (crop) =>
                crop.status ===
                "Ready for harvest"
            ).length,

          harvested,

          attention:
            crops.filter(
              (crop) =>
                crop.status ===
                "Needs attention"
            ).length
        },

        weather:
          await getWeather(user.location)
      }
    });
  }
);

/* ================================
   CROPS
================================ */

app.get(
  "/api/crops",
  authenticate,
  (req, res) => {
    const database = readDatabase();

    const crops =
      database.crops
        .filter(
          (crop) =>
            crop.userId ===
            req.user.id
        )
        .sort(
          (a, b) => b.id - a.id
        );

    res.json({ crops });
  }
);

app.post(
  "/api/crops",
  authenticate,
  (req, res) => {
    const name = clean(req.body.name);

    if (!name) {
      return res.status(400).json({
        message: "Crop name is required."
      });
    }

    const database = readDatabase();

    const crop = {
      id: nextId(database.crops),
      userId: req.user.id,
      name,
      variety: clean(req.body.variety),
      area: Math.max(
        0,
        numberValue(req.body.area)
      ),
      unit:
        clean(req.body.unit) ||
        "acres",
      status:
        clean(req.body.status) ||
        "Growing",
      plantedDate:
        clean(req.body.plantedDate),
      expectedHarvest:
        clean(req.body.expectedHarvest),
      notes: clean(req.body.notes),
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };

    database.crops.push(crop);

    writeDatabase(database);

    res.status(201).json({
      message: "Crop added successfully.",
      crop
    });
  }
);

app.put(
  "/api/crops/:id",
  authenticate,
  (req, res) => {
    const id =
      Number(req.params.id);

    const database = readDatabase();

    const crop =
      database.crops.find(
        (item) =>
          item.id === id &&
          item.userId ===
            req.user.id
      );

    if (!crop) {
      return res.status(404).json({
        message: "Crop not found."
      });
    }

    for (const field of [
      "name",
      "variety",
      "unit",
      "status",
      "plantedDate",
      "expectedHarvest",
      "notes"
    ]) {
      if (
        req.body[field] !==
        undefined
      ) {
        crop[field] =
          clean(req.body[field]);
      }
    }

    if (
      req.body.area !==
      undefined
    ) {
      crop.area = Math.max(
        0,
        numberValue(
          req.body.area
        )
      );
    }

    if (!crop.name) {
      return res.status(400).json({
        message:
          "Crop name is required."
      });
    }

    crop.updatedAt =
      new Date().toISOString();

    writeDatabase(database);

    res.json({
      message:
        "Crop updated successfully.",
      crop
    });
  }
);

app.delete(
  "/api/crops/:id",
  authenticate,
  (req, res) => {
    const id =
      Number(req.params.id);

    const database =
      readDatabase();

    const index =
      database.crops.findIndex(
        (crop) =>
          crop.id === id &&
          crop.userId ===
            req.user.id
      );

    if (index === -1) {
      return res.status(404).json({
        message: "Crop not found."
      });
    }

    database.crops.splice(
      index,
      1
    );

    writeDatabase(database);

    res.json({
      message:
        "Crop deleted successfully."
    });
  }
);

/* ================================
   MARKETPLACE
================================ */

app.get(
  "/api/listings",
  authenticate,
  (req, res) => {
    const database =
      readDatabase();

    let listings =
      [...database.listings]
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    const search =
      clean(
        req.query.search
      ).toLowerCase();

    const category =
      clean(
        req.query.category
      ).toLowerCase();

    if (search) {
      listings =
        listings.filter(
          (listing) =>
            [
              listing.title,
              listing.description,
              listing.location,
              listing.category,
              listing.sellerName
            ]
              .join(" ")
              .toLowerCase()
              .includes(search)
        );
    }

    if (
      category &&
      category !== "all"
    ) {
      listings =
        listings.filter(
          (listing) =>
            String(
              listing.category
            ).toLowerCase() ===
            category
        );
    }

    res.json({ listings });
  }
);

app.post(
  "/api/listings",
  authenticate,
  (req, res) => {
    const title =
      clean(req.body.title);

    if (!title) {
      return res.status(400).json({
        message:
          "Product title is required."
      });
    }

    const database =
      readDatabase();

    const listing = {
      id:
        nextId(
          database.listings
        ),

      userId:
        req.user.id,

      sellerName:
        req.user.name,

      title,

      category:
        clean(
          req.body.category
        ) || "Other",

      quantity: Math.max(
        0,
        numberValue(
          req.body.quantity
        )
      ),

      unit:
        clean(
          req.body.unit
        ) || "kg",

      price: Math.max(
        0,
        numberValue(
          req.body.price
        )
      ),

      location:
        clean(
          req.body.location
        ) ||
        req.user.location ||
        "India",

      description:
        clean(
          req.body.description
        ),

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString()
    };

    database.listings.push(
      listing
    );

    writeDatabase(database);

    res.status(201).json({
      message:
        "Listing published successfully.",
      listing
    });
  }
);

app.put(
  "/api/listings/:id",
  authenticate,
  (req, res) => {
    const id =
      Number(req.params.id);

    const database =
      readDatabase();

    const listing =
      database.listings.find(
        (item) =>
          item.id === id &&
          item.userId ===
            req.user.id
      );

    if (!listing) {
      return res.status(404).json({
        message:
          "Listing not found."
      });
    }

    for (const field of [
      "title",
      "category",
      "unit",
      "location",
      "description"
    ]) {
      if (
        req.body[field] !==
        undefined
      ) {
        listing[field] =
          clean(
            req.body[field]
          );
      }
    }

    if (
      req.body.quantity !==
      undefined
    ) {
      listing.quantity =
        Math.max(
          0,
          numberValue(
            req.body.quantity
          )
        );
    }

    if (
      req.body.price !==
      undefined
    ) {
      listing.price =
        Math.max(
          0,
          numberValue(
            req.body.price
          )
        );
    }

    if (!listing.title) {
      return res.status(400).json({
        message:
          "Product title is required."
      });
    }

    listing.updatedAt =
      new Date().toISOString();

    writeDatabase(database);

    res.json({
      message:
        "Listing updated successfully.",
      listing
    });
  }
);

app.delete(
  "/api/listings/:id",
  authenticate,
  (req, res) => {
    const id =
      Number(req.params.id);

    const database =
      readDatabase();

    const index =
      database.listings.findIndex(
        (listing) =>
          listing.id === id &&
          listing.userId ===
            req.user.id
      );

    if (index === -1) {
      return res.status(404).json({
        message:
          "Listing not found."
      });
    }

    database.listings.splice(
      index,
      1
    );

    writeDatabase(database);

    res.json({
      message:
        "Listing deleted successfully."
    });
  }
);

/* ================================
   STATIC FRONTEND
================================ */

app.use(
  express.static(PUBLIC_DIR)
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );
  }
);

/* ================================
   ERROR HANDLER
================================ */

app.use(
  (error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      message:
        "Internal server error."
    });
  }
);

/* ================================
   START
================================ */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🌱 UMMI AGRI running on port ${PORT}`
    );
  }
);