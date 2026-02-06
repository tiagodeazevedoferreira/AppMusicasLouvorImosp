import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// Configurações
const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

// Variáveis globais
let musicas = [];
let dadosFirebaseMap = new Map();

// Normaliza nome
function normalizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Carrega dados
async function carregarDados() {
  console.log('🔄 Iniciando carregamento...');
  try {
    // Planilha
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    if (!resMusicas.ok) throw new Error(`Planilha: ${resMusicas.status}`);
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values?.slice(1) || [];
    console.log('✅ Planilha OK:', musicas.length, 'músicas');

    // Firebase
    if (window.firebaseDb) {
      const dbRef = ref(window.firebaseDb, 'musicas');
      const snapshot = await get(dbRef);
      if (snapshot.exists()) {
        const dados = snapshot.val();
        Object.keys(dados).forEach(chave => {
          dadosFirebaseMap.set(chave, {
            letra: dados[chave].letra || 'Letra não encontrada',
            cifra: dados[chave].cifra || ''
          });
        });
        console.log('✅ Firebase OK!', dadosFirebaseMap.size, 'letras carregadas');
      }
    }

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('❌ Erro:', err);
    document.getElementById('resultados').innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
        <p>Carregamento parcial. Use "Limpar".</p>
      </div>`;
    preencherFiltros();
    filtrarEMostrar();
  }
}

// ✅ PREENCHE FILTROS SEM DUPLICATAS
function preencherFiltros() {
  // Artistas únicos
  const artistasUnicos = [...new Set(musicas.map(m => m[2]).filter(Boolean))].sort();
  preencherSelect('filtroArtista', artistasUnicos);

  // Datas ÚNICAS (CORRIGIDO: Set + filter + sort)
  const datasRaw = musicas.map(m => m[4]).filter(Boolean); // Remove vazios PRIMEIRO
  const datasUnicas = [...new Set(datasRaw)].sort((a, b) => b.localeCompare(a, 'pt-BR')); // Set remove duplicatas
  preencherSelect('filtroData', datasUnicas);
  console.log('📅 Datas únicas:', datasUnicas.length, datasUnicas.slice(0,5)); // Debug

  // Músicas únicas
  const musicasUnicas = musicas
    .filter(m => m[0]?.trim())
    .map(m => m[0].trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  preencherSelect('filtroMusica', musicasUnicas);
}

function preencherSelect(id, lista) {
  const select = document.getElementById(id);
  while (select.options.length > 1) select.remove(1);
  lista.forEach(valor => {
    const opt = new Option(valor, valor);
    select.add(opt);
  });
}

function filtrarEMostrar() {
  const filtros = {
    nome: document.getElementById('filtroNome')?.value?.trim().toLowerCase() || '',
    musica: document.getElementById('filtroMusica')?.value || '',
    artista: document.getElementById('filtroArtista')?.value || '',
    data: document.getElementById('filtroData')?.value || '',
    letra: document.getElementById('filtroLetra')?.value?.trim().toLowerCase() || ''
  };

  const filtrados = musicas.filter(([nomeMus, tomMus, art, link, dt]) => {
    return (!filtros.nome || nomeMus.toLowerCase().includes(filtros.nome)) &&
           (!filtros.musica || nomeMus === filtros.musica) &&
           (!filtros.artista || art === filtros.artista) &&
           (!filtros.data || dt === filtros.data) &&
           (!filtros.letra || {
             [normalizarNome(nomeMus)]: dadosFirebaseMap.get(normalizarNome(nomeMus))?.letra || ''
           }[normalizarNome(nomeMus)].toLowerCase().includes(filtros.letra));
  });

  mostrarResultados(filtrados.sort((a,b) => (a[0] || '').localeCompare(b[0] || '', 'pt-BR')));
}

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  if (lista.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-music-note-beamed display-1 text-muted"></i>
        <h4 class="mt-3 text-muted">Nenhuma música encontrada</h4>
      </div>`;
    return;
  }

  container.innerHTML = lista.map(([nomeMus, tom, artista, link, data]) => {
    const chave = normalizarNome(nomeMus);
    const { letra = 'Letra não encontrada', cifra = '' } = dadosFirebaseMap.get(chave) || {};
    const videoId = link?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || '';

    return `
      <div class="col-12 col-lg-6 col-xl-4">
        <div class="card musica-card h-100 shadow-lg">
          <div class="card-body">
            <h5 class="card-title fw-bold mb-1">${nomeMus}</h5>
            <p class="card-text mb-3 small">
              <i class="bi bi-person-fill me-1"></i>${artista || 'Não informado'}<br>
              <i class="bi bi-music-note-list me-1"></i>${tom || 'Não informado'}
              ${data ? `<br><i class="bi bi-calendar me-1 opacity-75">${data}</i>` : ''}
            </p>
            
            ${videoId ? `
              <iframe class="w-100 rounded mb-3" height="180" 
                      src="https://www.youtube.com/embed/${videoId}" 
                      title="${nomeMus}" 
                      allowfullscreen loading="lazy"></iframe>
            ` : ''}
            
            ${cifra ? `
              <a href="${cifra}" target="_blank" class="btn btn-light btn-sm w-100 mb-3">
                <i class="bi bi-guitar"></i> Cifra
              </a>
            ` : ''}
            
            <div class="letra" style="max-height: 280px; overflow-y: auto;">
              ${letra}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// LIMPAR FUNCIONAL
function limparFiltros() {
  document.getElementById('filtroNome').value = '';
  document.getElementById('filtroLetra').value = '';
  ['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => {
    document.getElementById(id).selectedIndex = 0;
  });
  filtrarEMostrar();
  console.log('🧹 Filtros limpos!');
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  carregarDados();
  
  // Filtros automáticos
  ['filtroNome', 'filtroLetra'].forEach(id => {
    document.getElementById(id).addEventListener('input', filtrarEMostrar);
  });
  ['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => {
    document.getElementById(id).addEventListener('change', filtrarEMostrar);
  });
});
