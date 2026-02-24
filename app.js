const SHEETID = "1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc";
const SHEETTAB = "Musicas";  // Nome exato da aba (corrigido do gid)
const APIKEY = "AIzaSyAVdsQ-1qWuxN74IBtKy3YXUmSKBZT6uWQ";  // NOVA CHAVE

let musicas = [];
let dadosFirebaseMap = new Map();

function normalizarNome(nome, artista) {
  const nomeNorm = nome?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const artistaNorm = artista?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  return nomeNorm + '---' + artistaNorm;
}

async function carregarDados() {
  console.log('Iniciando...');
  const container = document.getElementById('resultados');
  container.innerHTML = `
    <div class="col-12 text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p>Carregando...</p>
    </div>
  `;

  try {
    // PLANILHA - URL corrigida com nome da aba
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETID}/values/${encodeURIComponent(SHEETTAB)}!A:E?key=${APIKEY}`;
    console.log('URL Planilha:', url);  // Para debug

    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Planilha ${res.status}: ${errorText}`);
    }
    const data = await res.json();
    musicas = data.values
      ?.slice(1)
      .map(row => ({
        nome: row[0]?.trim(),
        tom: row[1]?.trim(),
        artista: row[2]?.trim(),
        link: row[3]?.trim(),
        data: row[4]?.trim()
      }))
      .filter(m => m.nome);
    console.log('Planilha OK,', musicas.length, 'músicas');

    // FIREBASE LETRAS (opcional)
    if (window.firebaseDb) {
      try {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const dbRef = ref(window.firebaseDb, 'musicas');
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
          const dados = snapshot.val();
          Object.keys(dados).forEach(chave => {
            dadosFirebaseMap.set(chave, dados[chave]);
          });
          console.log('Firebase OK,', dadosFirebaseMap.size, 'entradas');
        }
      } catch (err) {
        console.log('Firebase erro:', err.message);
      }
    }

    filtrarEMostrar();
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger text-center">Erro: ${err.message}</div>`;
  }
}

function filtrarEMostrar() {
  const filtroNome = document.getElementById('filtroNome')?.value.toLowerCase() || '';
  const filtroLetra = document.getElementById('filtroLetra')?.value.toLowerCase() || '';
  const filtroMusica = document.getElementById('filtroMusica')?.value || '';
  const filtroArtista = document.getElementById('filtroArtista')?.value || '';
  const filtroData = document.getElementById('filtroData')?.value || '';

  let filtradas = musicas.filter(m => {
    const nomeLower = m.nome.toLowerCase();
    const artistaLower = m.artista.toLowerCase();
    const tomLower = m.tom.toLowerCase();

    const matchNome = nomeLower.includes(filtroNome) || tomLower.includes(filtroNome) || artistaLower.includes(filtroNome);
    if (!matchNome) return false;

    const matchMusica = !filtroMusica || (filtroMusica === 'comCifra' ? !!m.link : true);
    const matchArtista = !filtroArtista || artistaLower.includes(filtroArtista.toLowerCase());
    const matchData = !filtroData || m.data === filtroData;

    let matchLetra = true;
    if (filtroLetra) {
      const dadosFb = dadosFirebaseMap.get(normalizarNome(m.nome, m.artista));
      const letraFb = dadosFb?.letra?.toLowerCase() || '';
      matchLetra = letraFb.includes(filtroLetra);
    }

    return matchMusica && matchArtista && matchData && matchLetra;
  });

  // Ordenar por data decrescente
  filtradas.sort((a, b) => {
    const dateA = a.data ? new Date(a.data.split('/').reverse().join('-')) : new Date(0);
    const dateB = b.data ? new Date(b.data.split('/').reverse().join('-')) : new Date(0);
    return dateB - dateA;
  });

  const container = document.getElementById('resultados');
  if (!filtradas.length) {
    container.innerHTML = '<p class="text-center text-muted">Nenhuma música encontrada.</p>';
    return;
  }

  container.innerHTML = filtradas.map(m => {
    const chaveNorm = normalizarNome(m.nome, m.artista);
    const dadosFb = dadosFirebaseMap.get(chaveNorm);
    const letra = dadosFb?.letra || 'Letra não disponível';
    const cifraTexto = dadosFb?.cifra || '';
    const urlImagemCifra = dadosFb?.url_imagem_cifra || '';

    const videoId = m.link?.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];

    return `
      <div class="col-12">
        <div class="musica-card p-3">
          <h5 class="mb-1">${m.nome}</h5>
          <p class="mb-2 small opacity-75">
            <i class="bi bi-music-note-beamed me-1"></i>${m.tom || 'Tom não informado'} - ${m.artista || 'Artista não informado'}
            ${m.data ? `<br><i class="bi bi-calendar me-1">${m.data}</i>` : ''}
          </p>
          ${videoId ? `
            <iframe class="w-100 rounded mb-3" height="180" src="https://www.youtube.com/embed/${videoId}" title="${m.nome}" allowfullscreen loading="lazy"></iframe>
          ` : ''}
          <!-- NOVO: Botão e visualização da CIFRA (imagem) -->
          <details class="mb-3">
            <summary class="btn btn-light btn-sm w-100 mb-2 fw-bold"><i class="bi bi-file-earmark-music me-1"></i>Cifra</summary>
            <div class="cifra bg-light p-3 rounded small text-center" style="font-family:monospace; overflow-y: hidden; max-height: none;">
              ${urlImagemCifra 
                ? `<img src="${urlImagemCifra}" alt="Cifra da música ${m.nome}" class="img-fluid rounded shadow-sm" loading="lazy" style="max-width:100%; height:auto; display:block; margin:0 auto;">`
                : `<p class="text-muted my-3">Cifra (imagem) não disponível</p>`
              }
              ${cifraTexto ? `<pre class="mt-3 text-start small" style="white-space: pre-wrap;">${cifraTexto}</pre>` : ''}
            </div>
          </details>
          <details>
            <summary class="btn btn-outline-light btn-sm w-100 fw-bold"><i class="bi bi-file-earmark-text me-1"></i>Letra</summary>
            <div class="letra bg-light p-3 rounded small" style="font-family:Georgia,serif;line-height:1.6;max-height:280px;overflow-y:auto;">${letra}</div>
          </details>
        </div>
      </div>
    `;
  }).join('');
}

// Limpar filtros
window.limparFiltros = () => {
  ['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id).value = '');
  ['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id).selectedIndex = 0);
  filtrarEMostrar();
};

// Init
document.addEventListener('DOMContentLoaded', carregarDados);
['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id)?.addEventListener('input', filtrarEMostrar));
['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id)?.addEventListener('change', filtrarEMostrar));