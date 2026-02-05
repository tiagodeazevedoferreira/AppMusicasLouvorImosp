const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

let musicas = [];
let letrasMap = new Map();

async function carregarDados() {
  try {
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values.slice(1);

    const resLetras = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Letras?key=${API_KEY}`
    );
    const dataLetras = await resLetras.json();
    dataLetras.values.slice(1).forEach(([nome, letra]) => {
      letrasMap.set(nome.trim().toLowerCase(), letra);
    });

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    document.getElementById('resultados').innerHTML = '<p class="text-danger">Erro ao carregar o catálogo. Tente novamente mais tarde.</p>';
  }
}

function preencherFiltros() {
  // Artistas
  const artistasUnicos = [...new Set(musicas.map(m => m[2]))].sort();
  const selectArtista = document.getElementById('filtroArtista');
  artistasUnicos.forEach(art => {
    const opt = document.createElement('option');
    opt.value = art;
    opt.textContent = art;
    selectArtista.appendChild(opt);
  });

  // Tons
  const tonsUnicos = [...new Set(musicas.map(m => m[1]))]
    .filter(t => t && t.trim() !== '')
    .sort();
  const selectTom = document.getElementById('filtroTom');
  tonsUnicos.forEach(tom => {
    const opt = document.createElement('option');
    opt.value = tom;
    opt.textContent = tom;
    selectTom.appendChild(opt);
  });

  // Datas
  const datasUnicas = [...new Set(musicas.map(m => m[4]))].sort().reverse();
  const selectData = document.getElementById('filtroData');
  datasUnicas.forEach(dt => {
    const opt = document.createElement('option');
    opt.value = dt;
    opt.textContent = dt;
    selectData.appendChild(opt);
  });

  // Músicas
  const musicasValidas = musicas
    .filter(m => m && m[0] && typeof m[0] === 'string' && m[0].trim() !== '')
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  const selectMusica = document.getElementById('filtroMusica');
  musicasValidas.forEach(mus => {
    const nomeMus = mus[0].trim();
    const opt = document.createElement('option');
    opt.value = nomeMus;
    opt.textContent = nomeMus;
    selectMusica.appendChild(opt);
  });
}

function filtrarEMostrar() {
  const musicaSelecionada = document.getElementById('filtroMusica').value;
  const nome = document.getElementById('filtroNome').value.trim().toLowerCase();
  const artista = document.getElementById('filtroArtista').value;
  const tom = document.getElementById('filtroTom').value;
  const letra = document.getElementById('filtroLetra').value.trim().toLowerCase();
  const data = document.getElementById('filtroData').value;

  const resultadosFiltrados = musicas.filter(mus => {
    const [nomeMus, tomMus, art, link, dt, cifra] = mus;

    const matchMusica = !musicaSelecionada || nomeMus === musicaSelecionada;
    const matchNome = !nome || nomeMus.toLowerCase().includes(nome);
    const matchArtista = !artista || art === artista;
    const matchTom = !tom || tomMus === tom;
    const matchData = !data || dt === data;

    let matchLetra = true;
    if (letra) {
      const letraMus = letrasMap.get(nomeMus.trim().toLowerCase()) || '';
      matchLetra = letraMus.toLowerCase().includes(letra);
    }

    return matchMusica && matchNome && matchArtista && matchTom && matchData && matchLetra;
  });

  resultadosFiltrados.sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  mostrarResultados(resultadosFiltrados);
}

async function extrairCifraLimpa(url) {
  try {
    // Só tenta extrair se for do Cifra Club
    if (!url.includes('cifraclub.com.br')) {
      return null;
    }

    const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Falha ao buscar página');

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Procura o container principal da cifra (baseado nos exemplos)
    const cifraContainer = doc.querySelector('.cifra') || doc.querySelector('.cifra-part') || doc.querySelector('[class*="cifra"]');

    if (cifraContainer) {
      // Limpa elementos indesejados (se existirem dentro)
      const toRemove = cifraContainer.querySelectorAll('h1, h2, h3, .advertising, .footer, script, style, noscript');
      toRemove.forEach(el => el.remove());

      // Retorna o HTML interno limpo
      return cifraContainer.innerHTML;
    }

    return null;
  } catch (err) {
    console.error('Erro ao extrair cifra:', err);
    return null;
  }
}

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma música encontrada com os filtros aplicados.</p>';
    return;
  }

  lista.forEach(mus => {
    const [nomeMus, tom, artista, link, data, cifraLink] = mus;
    const letra = letrasMap.get(nomeMus.trim().toLowerCase()) || 'Letra não encontrada';

    let videoId = '';
    if (link) {
      const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      videoId = match ? match[1] : '';
    }

    const hasCifra = cifraLink && typeof cifraLink === 'string' && cifraLink.trim().startsWith('http');

    const card = document.createElement('div');
    card.className = 'col-12';
    card.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">${nomeMus}</h5>
          <p class="card-text">
            <strong>Artista:</strong> ${artista} <br>
            <strong>Tom:</strong> ${tom}
          </p>
          
          <button class="btn btn-outline-primary btn-sm me-2" 
                  onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">
            Ver letra
          </button>
          <div class="letra-expand mt-2">${letra}</div>

          ${videoId ? `
            <button class="btn btn-outline-danger btn-sm mt-2 me-2" 
                    onclick="this.nextElementSibling.innerHTML = '<div class=\\\'iframe-container\\\'><iframe src=\\\'https://www.youtube.com/embed/${videoId}\\\' frameborder=\\\'0\\\' allowfullscreen></iframe></div>'">
              Ver vídeo
            </button>
            <div class="mt-3"></div>
          ` : ''}

          ${hasCifra ? `
            <button class="btn btn-outline-success btn-sm mt-2" 
                    onclick="toggleCifraLimpa(this, '${cifraLink.trim()}')">
              Ver cifra
            </button>
            <div class="mt-3 cifra-limpa" style="display:none;"></div>
          ` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Função para alternar e carregar cifra limpa
async function toggleCifraLimpa(button, url) {
  const container = button.nextElementSibling;
  if (container.style.display === 'block') {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  // Mostra loading temporário
  container.innerHTML = '<p class="text-muted">Carregando cifra...</p>';
  container.style.display = 'block';

  const cifraHtml = await extrairCifraLimpa(url);

  if (cifraHtml) {
    container.innerHTML = `
      <div style="
        background-color: #f1f3f5; 
        padding: 15px; 
        border-radius: 6px; 
        font-family: 'Courier New', Courier, monospace; 
        white-space: pre-wrap; 
        font-size: 16px; 
        line-height: 1.5;
        overflow-x: auto;
      ">
        <style>
          .cifra span.chord { color: #1e40af; font-weight: bold; }
        </style>
        ${cifraHtml}
      </div>
    `;
  } else {
    // Fallback: abre no navegador
    window.open(url, '_blank');
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

// Eventos de filtro
document.getElementById('filtroMusica').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroNome').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroArtista').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroTom').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroLetra').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroData').addEventListener('change', filtrarEMostrar);

// Botão Limpar
document.getElementById('btnLimpar').addEventListener('click', () => {
  document.getElementById('filtroMusica').value = '';
  document.getElementById('filtroNome').value = '';
  document.getElementById('filtroArtista').value = '';
  document.getElementById('filtroTom').value = '';
  document.getElementById('filtroLetra').value = '';
  document.getElementById('filtroData').value = '';
  filtrarEMostrar();
});

carregarDados();