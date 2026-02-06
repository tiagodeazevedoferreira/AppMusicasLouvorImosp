import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// CONFIGS
const SPREADSHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A",
  authDomain: "appmusicasimosp.firebaseapp.com",
  databaseURL: "https://appmusicasimosp-default-rtdb.firebaseio.com",
  projectId: "appmusicasimosp",
  storageBucket: "appmusicasimosp.appspot.com"
};

// NORMALIZAÇÃO
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

// 🔑 EXTRAI LETRA/CIFRA da coluna Cifra (CifraClub, YouTube, etc)
async function extrairConteudo(url) {
  if (!url) return '';

  console.log(`📥 Buscando conteúdo: ${url}`);
  
  try {
    // CifraClub - extrai letra + cifra
    if (url.includes('cifraclub.com.br')) {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Tenta pegar letra/cifra
      let conteudo = $('.cifra').text() ||
                    $('.cifra-part').text() ||
                    $('[class*="cifra"]').first().text() ||
                    $('.letra').text() ||
                    $('.lyrics').text();

      if (conteudo) {
        conteudo = conteudo.trim().replace(/\n{3,}/g, '\n\n');
        console.log('✅ Letra/cifra extraída do CifraClub');
        return conteudo;
      }
    }
    
    // YouTube - só link (não dá pra extrair letra)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      console.log('ℹ️ YouTube detectado (link mantido)');
      return url;
    }
    
    // Outros links - tenta como texto simples
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const text = await response.text();
      console.log('ℹ️ Link externo mantido');
      return url;
    }
    
  } catch (err) {
    console.error(`❌ Falha ${url}:`, err.message);
  }
  
  return url || 'Conteúdo não encontrado';
}

// 🚀 EXECUÇÃO PRINCIPAL (SÓ ABA MÚSICAS)
async function main() {
  console.log('🎵 SCRAPER IMOSP - Só aba "Músicas"');
  
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  doc.axios.defaults.headers.common.Authorization = `Bearer ${await serviceAccountAuth.authorize().then(r => r.access_token)}`;
  
  await doc.loadInfo();
  console.log('📊 Planilha:', doc.title);
  
  console.log('📋 Abas disponíveis:', doc.sheetsByIndex.map(s => s.title).join(', '));

  // ✅ APENAS aba "Músicas"
  const musicasSheet = doc.sheetsByTitle['Músicas'];
  if (!musicasSheet) {
    throw new Error('❌ Aba "Músicas" não encontrada! Verifique nome exato.');
  }
  
  const musicasRows = await musicasSheet.getRows();
  console.log('🎼 Músicas encontradas:', musicasRows.length);

  let processadas = 0;
  let comCifra = 0;

  for (const row of musicasRows) {
    const nome = row.get('Música')?.trim();
    if (!nome) continue;

    const nomeNormalizado = normalizarNome(nome);
    const colunaCifra = row.get('Cifra')?.trim() || '';

    const conteudo = await extrairConteudo(colunaCifra);
    if (conteudo !== colunaCifra) comCifra++;

    // Salva TUDO no Firebase
    await set(ref(db, `musicas/${nomeNormalizado}`), {
      nomeOriginal: nome,
      letra: conteudo.includes('cifra') || conteudo.includes('CifraClub') ? conteudo : 'Letra não encontrada',
      cifra: conteudo,
      urlOriginal: colunaCifra,
      ultimaAtualizacao: new Date().toISOString()
    });

    processadas++;
    if (processadas % 10 === 0) console.log(`⏳ ${processadas}/${musicasRows.length}`);
  }

  console.log(`🎉 FINALIZADO!`);
  console.log(`✅ ${processadas} músicas processadas`);
  console.log(`🎸 ${comCifra} com letra/cifra extraída`);
}

main().catch(err => {
  console.error('💥 ERRO:', err.message);
  process.exit(1);
});
