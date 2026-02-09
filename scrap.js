import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import puppeteer from 'puppeteer';

console.log('🚀 Iniciando scrape GSheet → Cifra Club → Firebase...');

// === CONFIGS ===
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const FIREBASE_PATH = 'musicas';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/`,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// === TESTE - URLs FIXAS (pula Google Sheets bug) ===
async function getCifraClubUrls() {
  console.log('🧪 MODO TESTE - 5 URLs fixas de louvor');
  return [
    'https://www.cifraclub.com.br/fernandinho/grato/',
    'https://www.cifraclub.com.br/diante-do-trono/mande-um-fogo-novo/',
    'https://www.cifraclub.com.br/aline-barros/risos/',
    'https://www.cifraclub.com.br/thalles-roberto/nada-surpreende-deus/',
    'https://www.cifraclub.com.br/isadora-pompeo/nao-estou-so/'
  ];
}

// === SCRAPING CIFRA CLUB ===
async function scrapeCifra(url) {
  console.log(`📖 Scraping: ${url}`);
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox
