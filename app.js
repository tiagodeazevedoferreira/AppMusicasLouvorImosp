const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const API_KEY = 'AIzaSyDcj5ebPcBXw5Ev6SQHXzxToCGfINprj_A';

let musicas = [];
let letrasMap = new Map(); // nome -> letra

async function carregarDados() {
  try {
    // Carrega aba Músicas
    const resMusicas = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Músicas?key=${API_KEY}`
    );
    const dataMusicas = await resMusicas.json();
    musicas = dataMusicas.values.slice(1); // remove cabeçalho

    // Carrega aba Letras
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
  const artistasUnicos = [...new Set(musicas.map(m => m[2]))].sort();
  const datasUnicas = [...new Set(musicas.map(m => m[4]))].sort().reverse();

  const selectArtista = document.getElementById('filtroArtista');
  artistasUnicos.forEach(art => {
    const opt = document.createElement('option');
    opt.value = art;
    opt.textContent = art;
    selectArtista.appendChild(opt);
  });

  const selectData = document.getElementById('filtroData');
  datasUnicas.forEach(dt => {
    const opt = document.createElement('option');
    opt.value = dt;
    opt.textContent = dt;
    selectData.appendChild(opt);
  });
}

function filtrarEMostrar() {
  const nome = document.getElementById('filtroNome').value.trim().toLowerCase();
  const artista = document.getElementById('filtroArtista').value;
  const letra = document.getElementById('filtroLetra').value.trim().toLowerCase();
  const data = document.getElementById('filtroData').value;

  const resultadosFiltrados = musicas.filter(mus => {
    const [nomeMus, tom, art, link, dt] = mus;

    const matchNome = !nome || nomeMus.toLowerCase().includes(nome);
    const matchArtista = !artista || art === artista;
    const matchData = !data || dt === data;

    let matchLetra = true;
    if (letra) {
      const letraMus = letrasMap.get(nomeMus.trim().toLowerCase()) || '';
      matchLetra = letraMus.toLowerCase().includes(letra);
    }

    return matchNome && matchArtista && matchData && matchLetra;
  });

  mostrarResultados(resultadosFiltrados);
}

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  container.innerHTML = '';

  if (lista.length === 0) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma música encontrada com os filtros aplicados.</p>';
    return;
  }

  lista.forEach(mus => {
    const [nomeMus, tom, artista, link] = mus; // Data removida da exibição
    const letra = letrasMap.get(nomeMus.trim().toLowerCase()) || 'Letra não encontrada';

    // Extrai ID do YouTube
    let videoId = '';
    if (link) {
      const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      videoId = match ? match[1] : '';
    }

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
            <button class="btn btn-outline-danger btn-sm mt-2" 
                    onclick="this.nextElementSibling.innerHTML = '<div class=\\\'iframe-container\\\'><iframe src=\\\'https://www.youtube.com/embed/${videoId}\\\' frameborder=\\\'0\\\' allowfullscreen></iframe></div>'">
              Ver vídeo
            </button>
            <div class="mt-3"></div>
          ` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Eventos de filtro
document.getElementById('filtroNome').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroArtista').addEventListener('change', filtrarEMostrar);
document.getElementById('filtroLetra').addEventListener('input', filtrarEMostrar);
document.getElementById('filtroData').addEventListener('change', filtrarEMostrar);

// Botão Limpar filtros
document.getElementById('btnLimpar').addEventListener('click', () => {
  document.getElementById('filtroNome').value = '';
  document.getElementById('filtroArtista').value = '';
  document.getElementById('filtroLetra').value = '';
  document.getElementById('filtroData').value = '';
  filtrarEMostrar(); // Mostra todas novamente
});

// Inicia o carregamento
carregarDados();