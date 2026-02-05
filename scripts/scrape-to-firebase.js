import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ────────────────────────────────────────────────
// CONFIGURAÇÕES – NÃO ALTERE AQUI
// ────────────────────────────────────────────────

const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: "appmusicasimosp.firebaseapp.com",
  databaseURL: "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: "appmusicasimosp",
  storageBucket: "appmusicasimosp.appspot.com",
  messagingSenderId: "SEU_SENDER_ID_AQUI", // substitua se tiver
  appId: "SEU_APP_ID_AQUI" // substitua se tiver
};

// ────────────────────────────────────────────────
// FUNÇÕES AUXILIARES
// ────────────────────────────────────────────────

function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

async function extrairCifra(url) {
  if (!url || !url.includes('cifraclub.com.br')) {
    return url || '';
  }

  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    let cifraText = $('.cifra').text() ||
                    $('.cifra-part').text() ||
                    $('[class*="cifra"]').first().text();

    if (cifraText) {
      cifraText = cifraText.trim().replace(/\n{3,}/g, '\n\n');
      return cifraText;
    }

    return url;
  } catch (err) {
    console.error(`Falha ao extrair cifra de ${url}:`, err.message);
    return url;
  }
}

// ────────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ────────────────────────────────────────────────

async function main() {
  console.log('Iniciando migração para Firebase...');

  // Inicializa Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  // Autenticação correta para google-spreadsheet v4.x
  const auth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // Cria a instância da planilha e autentica
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  doc.auth = auth; // ← forma correta de setar a autenticação na v4.x

  await doc.loadInfo();
  console.log('Planilha carregada com sucesso:', doc.title);

  // Carrega aba Músicas
  const musicasSheet = doc.sheetsByTitle['Músicas'];
  if (!musicasSheet) throw new Error('Aba "Músicas" não encontrada');
  const musicasRows = await musicasSheet.getRows();

  // Carrega aba Letras
  const letrasSheet = doc.sheetsByTitle['Letras'];
  if (!letrasSheet) throw new Error('Aba "Letras" não encontrada');
  const letrasRows = await letrasSheet.getRows();

  // Mapa temporário de letras
  const letrasMap = new Map();
  letrasRows.forEach(row => {
    const nome = row.get('Nome')?.trim().toLowerCase();
    const letra = row.get('Letra')?.trim();
    if (nome && letra) letrasMap.set(nome, letra);
  });

  // Processa cada música
  for (const row of musicasRows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const nomeNormalizado = normalizarNome(nome);
    const cifraLink = row.get('Cifra')?.trim() || '';

    const letra = letrasMap.get(nome.toLowerCase()) || 'Letra não encontrada';
    const cifra = await extrairCifra(cifraLink);

    // Salva no Firebase
    const caminho = `musicas/${nomeNormalizado}`;
    await set(ref(db, caminho), {
      nomeOriginal: nome,
      letra,
      cifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    console.log(`Salvo: ${nomeNormalizado}`);
  }

  console.log('Migração concluída com sucesso!');
}

main().catch(err => {
  console.error('Erro na migração:', err.message);
  process.exit(1);
});

// Versão corrigida 2025-02-05 v2
