# PARKNET — Smart Parking Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.2.5-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0.9-646cff.svg?logo=vite&logoColor=white)](https://vite.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-12.12.1-ffca28.svg?logo=firebase&logoColor=black)](https://firebase.google.com/)

A modern, high-performance web-based Smart Parking Management System built with **React 19** and **Vite**, featuring real-time **Firebase Firestore** synchronization, role-based access control, interactive multi-tier floor maps, and an integrated **Claude 3.5 Sonnet AI** assistant.

<p align="center">
  <img src="src/assets/hero.png" alt="PARKNET Multi-Level Architecture" width="220" />
</p>

---

## Key Features

- **Interactive Multi-Level Live Map**: Visual floor plan supporting 6 distinct levels (`B2`, `B1`, `GF`, `L1`, `L2`, `L3 Roof`) with slot status indicators (`Available`, `Occupied`, `Reserved`), slot classifications (`Standard`, `EV Charging`, `Accessible / Disabled`), and real-time occupancy pulse animations.
- **Instant Check-in & Check-out**: Dynamic hourly rate computation per floor, automated elapsed-time tracking, vehicle type tagging, and instant fee calculation with multi-mode payment support (`UPI`, `Cash`, `Card`, `FASTag`).
- **Real-Time Data Sync with Firebase**: Real-time snapshot listeners (`onSnapshot`) via Google Cloud Firestore for instant synchronization across all active dashboards and operator screens.
- **Role-Based Access Control**: Pre-configured role profiles for **Admin**, **Operator**, and **User** with tailored permissions, navigation tabs, and administrative settings.
- **Smart AI Parking Assistant**: Embedded conversational assistant powered by Anthropic Claude 3.5 Sonnet that answers live operator queries regarding slot availability, revenue metrics, floor occupancy, and active bookings.
- **Command Palette (`Ctrl + K`)**: Global keyboard shortcut palette for quick search across parking slots, floors, license plates, and system functions.
- **Live Activity Feed**: Slide-out notification center displaying real-time check-in and check-out events with elapsed timestamp badges.
- **Vehicle Registry & Tagging**: Searchable database tracking vehicle plates, owners, vehicle types (`Car`, `Bike`, `SUV`, `Truck`, `EV Car`), visit frequency, total accumulated spend, and priority status tags (`VIP`, `Monthly`).
- **Analytics & Revenue Reporting**: 30-day historical revenue trends, daily booking and vehicle volume sparklines, KPI counters with count-up animations, and payment method distribution charts.
- **Automatic Seed Utility**: Built-in initial data seeder (`seedFirestoreIfEmpty`) to bootstrap sample parking floors, 30 days of revenue history, and demo vehicle records if Firestore is uninitialized.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) (Hooks, StrictMode) |
| **Bundler & Dev Server** | [Vite 8](https://vite.dev/) (`@vitejs/plugin-react`) |
| **Backend & Database** | [Firebase 12](https://firebase.google.com/) (Firestore Realtime, Firebase Auth) |
| **AI Integration** | Anthropic Claude 3.5 Sonnet API |
| **Styling** | Vanilla CSS Design System with dark mode tokens (`#07080c` palette) |
| **Linting & Code Quality** | ESLint 9 (Flat Config, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) |
| **Deployment Target** | [Vercel](https://vercel.com/) (Single Page Application routing via `vercel.json`) |

---

## Demo Accounts

The system supports role-based authentication via Firebase Auth. You can create or use the following pre-configured account profiles:

| Role | Email | Default Password | Permissions |
|---|---|---|---|
| **Admin** | `admin@parknet.in` | `admin123` | Full system access, all floors, live maps, bookings, reports, system settings |
| **Operator** | `operator@parknet.in` | `op123` | Floor maps, check-in, check-out, bookings ledger, vehicle registry |
| **User** | `nfs@parknet.in` | `nfs123` | Dashboard, slot availability viewing, personal booking status |

---

## Project Structure

```
Smart-Parking-System/
├── public/
│   └── favicon.svg           # Application vector icon
├── src/
│   ├── assets/
│   │   └── hero.png          # Multi-level parking visual asset
│   ├── App.jsx               # Main SPA application, UI views, state & command palette
│   ├── firebase.js           # Firebase app init, Firestore listeners, auth helpers & seeder
│   ├── index.css             # Global reset and viewport base styles
│   └── main.jsx              # Application bootstrap & DOM root mount
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules tailored for Vite & Node.js
├── eslint.config.js          # ESLint flat config
├── index.html                # HTML5 application shell & font loading
├── LICENSE                   # MIT License
├── package.json              # Project manifest, dependencies, and npm scripts
├── package-lock.json         # Pinned npm dependency lockfile
├── vercel.json               # SPA rewrite rules for Vercel deployment
└── vite.config.js            # Vite configuration with React plugin
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (or `pnpm` / `yarn`)
- **Firebase Project**: A Firebase project with **Firestore Database** and **Email/Password Authentication** enabled.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nfsprogramming/Smart-Parking-System.git
   cd Smart-Parking-System
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the `.env.example` file to create `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your Anthropic API Key to enable the AI parking assistant chatbot:
   ```env
   VITE_ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

4. **Configure Firebase:**
   Update `src/firebase.js` with your Firebase project configuration credentials:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

5. **Start Local Development Server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173`.

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Starts Vite local development server with Hot Module Replacement (HMR). |
| `build` | `npm run build` | Compiles and bundles production-ready assets into the `dist/` folder. |
| `lint` | `npm run lint` | Runs ESLint 9 across all JSX and JS files with strict React Hooks rules. |
| `preview` | `npm run preview` | Locally serves the production build from `dist/` to verify bundling. |

---

## Deployment

The repository is configured for zero-configuration continuous deployment on [Vercel](https://vercel.com/):

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **SPA Routing**: Handled by [`vercel.json`](vercel.json) rewrites:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```

---

## License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.
