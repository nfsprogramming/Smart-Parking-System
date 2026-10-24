// ─── FIREBASE CONFIGURATION ───────────────────────────────────────────────────
// SETUP: Replace the values below with YOUR Firebase project config.
// Go to: Firebase Console → Project Settings → Your Apps → Web App Config
//
// To enable auth: Firebase Console → Authentication → Sign-in method → Email/Password → Enable
// To enable Firestore: Firebase Console → Firestore Database → Create database
//
// Default demo accounts to create in Firebase Auth:
//   admin@parknet.in     / admin123 → set displayName="Admin User", photoURL="admin"
//   operator@parknet.in  / op123    → set displayName="Operator Dev", photoURL="operator"
//   nfs@parknet.in       / nfs123   → set displayName="Nifras NFS", photoURL="user"

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// ⚠️  REPLACE THIS WITH YOUR OWN FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDZdFwqR1LmdeYCDHZxdLawZhGocRnua0I",
  authDomain: "smart-parking-service-c4e42.firebaseapp.com",
  projectId: "smart-parking-service-c4e42",
  storageBucket: "smart-parking-service-c4e42.firebasestorage.app",
  messagingSenderId: "38300332702",
  appId: "1:38300332702:web:4bea03890155dd9b23418f"
};

// Check if Firebase is properly configured
export const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let app, auth, db;

if (FIREBASE_CONFIGURED) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db };

// ─── USER ROLE MAPPING (stored in Firestore /users/{uid}) ────────────────────
const ROLE_MAP = {
  "admin@parknet.in": { role: "admin", avatar: "AU", name: "Admin User" },
  "operator@parknet.in": { role: "operator", avatar: "OD", name: "Operator Dev" },
  "nfs@parknet.in": { role: "user", avatar: "NF", name: "Nifras NFS" },
};

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
export async function firebaseLogin(email, password) {
  if (!FIREBASE_CONFIGURED) throw new Error("Firebase not configured");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const extra = ROLE_MAP[email] || { role: "user", avatar: "?", name: email };
  return {
    id: cred.user.uid,
    email: cred.user.email,
    name: extra.name,
    role: extra.role,
    avatar: extra.avatar,
  };
}

export function firebaseLogout() {
  if (!FIREBASE_CONFIGURED) return;
  return signOut(auth);
}

export function onAuthChange(callback) {
  if (!FIREBASE_CONFIGURED) return () => {};
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      const extra = ROLE_MAP[fbUser.email] || { role: "user", avatar: "?", name: fbUser.email };
      callback({
        id: fbUser.uid,
        email: fbUser.email,
        name: extra.name,
        role: extra.role,
        avatar: extra.avatar,
      });
    } else {
      callback(null);
    }
  });
}

// ─── SLOTS ────────────────────────────────────────────────────────────────────
export function subscribeToSlots(callback) {
  if (!FIREBASE_CONFIGURED) return () => {};
  return onSnapshot(collection(db, "slots"), (snap) => {
    const grouped = {};
    snap.forEach((doc) => {
      const s = { id: doc.id, ...doc.data() };
      if (!grouped[s.fid]) grouped[s.fid] = [];
      grouped[s.fid].push(s);
    });
    callback(grouped);
  });
}

export async function updateSlot(slotId, data) {
  if (!FIREBASE_CONFIGURED) return;
  await updateDoc(doc(db, "slots", slotId), data);
}

export async function createBooking(bookingData) {
  if (!FIREBASE_CONFIGURED) return;
  const ref = doc(collection(db, "bookings"));
  await setDoc(ref, { ...bookingData, createdAt: serverTimestamp() });
  return ref.id;
}

export async function closeBooking(bookingId, feeData) {
  if (!FIREBASE_CONFIGURED) return;
  await updateDoc(doc(db, "bookings", bookingId), {
    ...feeData,
    status: "completed",
    exit: Date.now(),
  });
}

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
export function subscribeToBookings(callback) {
  if (!FIREBASE_CONFIGURED) return () => {};
  const q = query(collection(db, "bookings"), orderBy("entry", "desc"), limit(100));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ─── VEHICLES ─────────────────────────────────────────────────────────────────
export async function getVehicles() {
  if (!FIREBASE_CONFIGURED) return [];
  const snap = await getDocs(collection(db, "vehicles"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── REVENUE ──────────────────────────────────────────────────────────────────
export async function getRevenue() {
  if (!FIREBASE_CONFIGURED) return [];
  const snap = await getDocs(query(collection(db, "revenue"), orderBy("ts", "asc"), limit(30)));
  return snap.docs.map((d) => d.data());
}

// ─── SEED INITIAL DATA (call once to populate Firestore) ─────────────────────
export async function seedFirestoreIfEmpty() {
  if (!FIREBASE_CONFIGURED) return;

  // Check if slots already exist
  const slotsSnap = await getDocs(collection(db, "slots"));
  if (!slotsSnap.empty) return; // Already seeded

  const FLOORS = [
    { id: "B2", label: "BASEMENT 2", rate: 20 },
    { id: "B1", label: "BASEMENT 1", rate: 25 },
    { id: "GF", label: "GROUND FLOOR", rate: 40 },
    { id: "L1", label: "LEVEL 1", rate: 40 },
    { id: "L2", label: "LEVEL 2", rate: 35 },
    { id: "L3", label: "LEVEL 3 (ROOF)", rate: 30 },
  ];
  const slotTypes = ["standard", "standard", "standard", "standard", "ev", "standard", "disabled", "standard"];
  const vehicleTypes = ["Car", "Bike", "SUV", "Truck", "EV Car"];
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randPlate = () => {
    const s = "ABCDEFGHJKLMNPRSTUVWXY";
    return `TN${rnd(1, 99).toString().padStart(2, "0")} ${s[rnd(0, s.length - 1)]}${s[rnd(0, s.length - 1)]} ${rnd(1000, 9999)}`;
  };

  const batch = writeBatch(db);

  // Seed slots
  FLOORS.forEach((f) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c++) {
        const slotId = `${f.id}-${r}-${c}`;
        const occ = Math.random() < 0.5;
        const slotData = {
          fid: f.id, row: r, col: c,
          type: slotTypes[c % slotTypes.length],
          occupied: occ,
          reserved: !occ && Math.random() < 0.07,
          plate: occ ? randPlate() : null,
          since: occ ? Date.now() - rnd(5, 240) * 60000 : null,
          vehicleType: occ ? vehicleTypes[rnd(0, vehicleTypes.length - 1)] : null,
          bookingId: null,
          rate: f.rate,
        };
        batch.set(doc(db, "slots", slotId), slotData);
      }
    }
  });

  // Seed revenue (30 days)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const revId = d.toISOString().split("T")[0];
    batch.set(doc(db, "revenue", revId), {
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: rnd(8000, 28000),
      bookings: rnd(80, 320),
      vehicles: rnd(60, 280),
      ts: d.getTime(),
    });
  }

  // Seed vehicles
  const owners = ["Arjun R", "Priya S", "Karthik M", "Divya N", "Ravi K", "Sunitha P"];
  for (let i = 0; i < 18; i++) {
    const vRef = doc(collection(db, "vehicles"));
    batch.set(vRef, {
      plate: randPlate(),
      owner: owners[rnd(0, owners.length - 1)],
      type: vehicleTypes[rnd(0, vehicleTypes.length - 1)],
      visits: rnd(3, 45),
      totalFee: rnd(500, 12000),
      lastSeen: Date.now() - rnd(10, 5000) * 60000,
      tag: Math.random() > 0.7 ? "VIP" : Math.random() > 0.5 ? "Monthly" : null,
    });
  }

  await batch.commit();
  console.log("✅ Firestore seeded with initial PARKNET data");
}
