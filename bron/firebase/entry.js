import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp, Timestamp, runTransaction, deleteDoc } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
window.FB = window.__FAKE_FB || { initializeAppCheck, ReCaptchaEnterpriseProvider, getAppCheckToken, getAI, getGenerativeModel, GoogleAIBackend, initializeApp, getAuth, initializeAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, indexedDBLocalPersistence,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp, Timestamp, runTransaction, deleteDoc };
